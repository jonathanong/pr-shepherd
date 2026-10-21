import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryItem } from "../types.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";
import { appendAutonomousInstructions } from "./stack-drain.mts";
import { splitStackWork } from "./stack-work.mts";

const ready = { readyReceipt: true } as const;
const probe = (pr: number) =>
  `pr-shepherd https://github.com/acme/widgets/pull/${pr} --timeout 1s --debounce 0s --no-auto-mark-ready`;

/** A draft whose automatic mark-ready transition is disabled, so its command is a bounded probe. */
function disabledDraft(
  pr: number,
  position: number,
  overrides: Partial<PollSummaryItem> = {},
): PollSummaryItem {
  return row(pr, position, {
    isDraft: true,
    action: "wait",
    reasons: ["draft-auto-mark-ready-disabled"],
    pollCommand: probe(pr),
    pollProbe: true,
    ...overrides,
  });
}

function text(result: { instructions?: string[] }): string {
  return result.instructions?.join("\n") ?? "";
}

describe("stack command agent work", () => {
  it("leaves a clean disabled draft held while an upper draft keeps its session", () => {
    const result = withPollSummaryInstructions(
      stack([disabledDraft(1, 1), row(2, 2, { isDraft: true })]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "shepherd", reason: "actionable" });
    expect(text(result)).not.toContain("gh pr ready");
    expect(text(result)).toContain("pull/2 --until-terminal");
    expect(text(result)).not.toContain("human action");
  });

  it("waits at the polling cadence when every remaining probe could only report waiting", () => {
    const waiting = (pr: number, position: number) =>
      disabledDraft(pr, position, {
        reasons: ["pending-or-unknown"],
        checks: { inProgress: 1 },
      });
    const result = withPollSummaryInstructions(stack([waiting(1, 1), waiting(2, 2)]), false);
    expect(result).toMatchObject({ nextAction: "wait", reason: "waiting", stackMergeable: false });
    expect(result.instructions).toEqual([
      "1. No one-PR session can advance the stack yet: PR #1 (pending-or-unknown); PR #2 (pending-or-unknown). Recheck at the configured polling cadence.",
    ]);
  });

  it("shepherds an upper draft while a lower layer needs a human", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { action: "escalate", reasons: ["triage-thrash"] }),
        row(2, 2, { isDraft: true }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).toContain("pull/2 --until-terminal");
    expect(text(result)).toContain(
      "PR #1 requires human action (triage-thrash). Keep shepherding other PRs before the handoff.",
    );
  });

  it("does not emit a session command for a layer the viewer does not own", () => {
    const unowned = row(1, 1, { action: "triage", reasons: ["failing-checks"] });
    delete unowned.owned;
    const result = withPollSummaryInstructions(stack([unowned]), false);
    expect(text(result)).toContain("PR #1 is not owned. Do not run a session for it.");
    expect(text(result)).not.toContain("pull/1 --until-terminal");
    expect(text(result)).toContain("only for `owned` rows");
  });

  it("says when an owned layer has no session command", () => {
    const instructions: string[] = [];
    appendAutonomousInstructions(instructions, [row(2, 2, { pollCommand: undefined })]);
    expect(instructions.join("\n")).toContain(
      "PR #2 needs a one-PR Shepherd session, but no command was available.",
    );
  });

  it("keeps an upper draft's review session above a layer that needs a human", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { action: "escalate", reasons: ["triage-thrash"] }),
        row(2, 2, { isDraft: true, action: "triage", reasons: ["review-work"] }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).toContain("pull/2 --until-terminal`.");
    expect(text(result)).not.toContain("stack-blocked");
    expect(text(result)).toContain("Keep shepherding other PRs before the handoff.");
  });

  it("stops for a human handoff on another layer without promoting a held draft", () => {
    const result = withPollSummaryInstructions(
      stack([disabledDraft(1, 1), row(2, 2, { action: "escalate", reasons: ["triage-thrash"] })]),
      false,
    );
    expect(result.nextAction).toBe("escalate");
    expect(text(result)).not.toContain("gh pr ready");
  });

  it("keeps a stale-ancestry child's session instead of marking it ready", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, ready), row(2, 2, ready), disabledDraft(3, 3, { action: "cancel" })], true),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(result.prs[2]).toMatchObject({
      action: "triage",
      reasons: ["draft-auto-mark-ready-disabled", "stale-ancestry"],
    });
    expect(text(result)).toContain(`Run \`${probe(3)}\`.`);
    expect(text(result)).not.toContain("gh pr ready");
  });

  it("merges a ready prefix without promoting the held draft above it", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, ready), disabledDraft(2, 2), row(3, 3, { isDraft: true })]),
      true,
    );
    expect(result.nextAction).toBe("merge");
    expect(text(result)).toContain("gh stack merge 1 --yes --squash");
    expect(text(result)).not.toContain("gh pr ready");
    expect(text(result)).toContain("pull/3 --until-terminal");
  });

  it("leaves a held draft while asking about a layer without a command", () => {
    const result = withPollSummaryInstructions(
      stack([disabledDraft(1, 1), row(2, 2, { pollCommand: undefined })]),
      false,
    );
    expect(result.nextAction).toBe("escalate");
    expect(text(result)).not.toContain("gh pr ready");
    expect(text(result)).toContain(
      "PR #2 needs a one-PR session, but Shepherd could not produce its command. Stop and ask for direction.",
    );
  });

  it("stops when every open layer is a clean draft held by disabled mark-ready", () => {
    const result = withPollSummaryInstructions(
      stack([disabledDraft(1, 1), disabledDraft(2, 2)]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "cancel", reason: "all_terminal" });
    expect(text(result)).toContain("Stop shepherding this stack");
    expect(text(result)).not.toContain("gh pr ready");
    expect(text(result)).not.toContain("rerun");
  });
});

describe("deferred check blockers", () => {
  it("promotes a non-probe wait that still has failing checks", () => {
    const blocked = row(1, 1, {
      action: "wait",
      reasons: ["blocked-by:acme/widgets#9"],
      checks: { failing: 1 },
    });
    expect(withPollSummaryInstructions(stack([blocked]), false).nextAction).toBe("shepherd");
  });

  it("does not shepherd a probed wait whose only failing check is blocked", () => {
    const blocked = row(1, 1, {
      action: "wait",
      reasons: ["blocked-by:acme/widgets#9"],
      checks: { failing: 1 },
      pollProbe: true,
    });
    const result = withPollSummaryInstructions(stack([blocked]), false);
    expect(result.nextAction).toBe("wait");
    expect(result.instructions?.join("\n")).toContain("acme/widgets#9");
    expect(result.instructions?.join("\n")).not.toContain("--until-terminal");
  });
});

describe("splitStackWork", () => {
  it("keeps a probe with work as a session and a clean draft without a command held", () => {
    const failing = disabledDraft(1, 1, { action: "triage", reasons: ["failing-checks"] });
    const noCommand = disabledDraft(2, 2, { pollCommand: undefined });
    expect(splitStackWork([failing, noCommand], new Set())).toEqual({
      sessions: [failing],
      held: [noCommand],
      idle: [],
    });
  });
});
