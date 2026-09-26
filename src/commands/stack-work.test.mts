import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryItem } from "../types.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";
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

describe("stack selector agent work", () => {
  it("hands a disabled draft's ready transition to the agent while an upper draft keeps its session", () => {
    const result = withPollSummaryInstructions(
      stack([disabledDraft(1, 1), row(2, 2, { isDraft: true })]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "shepherd", reason: "actionable" });
    expect(text(result)).toContain(`Run \`${probe(1)}\` first.`);
    expect(text(result)).toContain(
      "If it returns `[WAIT]` saying PR #1 stays in draft because automatic mark-ready is disabled for this session, run `gh pr ready 1 -R acme/widgets`; otherwise complete its instructions and leave PR #1 in draft this round.",
    );
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
        row(1, 1, { action: "escalate", reasons: ["fix-thrash"] }),
        row(2, 2, { isDraft: true }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).toContain("pull/2 --until-terminal");
    expect(text(result)).toContain(
      "PR #1 requires human action (fix-thrash). Keep shepherding other PRs before the handoff.",
    );
  });

  it("does not emit a session command for a layer the viewer does not own", () => {
    const unowned = row(1, 1, { action: "fix_code", reasons: ["failing-checks"] });
    delete unowned.owned;
    const result = withPollSummaryInstructions(stack([unowned]), false);
    expect(text(result)).toContain("PR #1 is not owned. Do not run a session for it.");
    expect(text(result)).not.toContain("pull/1 --until-terminal");
    expect(text(result)).toContain("rows marked `owned`");
  });

  it("keeps an upper draft's review session above a layer that needs a human", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { action: "escalate", reasons: ["fix-thrash"] }),
        row(2, 2, { isDraft: true, action: "fix_code", reasons: ["review-work"] }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).toContain("pull/2 --until-terminal` for PR #2.");
    expect(text(result)).not.toContain("stack-blocked");
    expect(text(result)).toContain("Keep shepherding other PRs before the handoff.");
  });

  it("marks a draft ready before a human handoff on another layer", () => {
    const result = withPollSummaryInstructions(
      stack([disabledDraft(1, 1), row(2, 2, { action: "escalate", reasons: ["fix-thrash"] })]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).toContain("gh pr ready 1 -R acme/widgets");
    expect(text(result)).toContain("Keep shepherding other PRs before the handoff.");
  });

  it("keeps a stale-ancestry child's session instead of marking it ready", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, ready), row(2, 2, ready), disabledDraft(3, 3)], true),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).toContain(`Run \`${probe(3)}\` for PR #3.`);
    expect(text(result)).not.toContain("gh pr ready");
  });

  it("lists the ready-for-review step beside a bottom-layer merge", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, ready), disabledDraft(2, 2), row(3, 3, { isDraft: true })]),
      true,
    );
    expect(result.nextAction).toBe("merge");
    expect(text(result)).toContain("gh stack merge 1 --yes --squash");
    expect(text(result)).toContain("gh pr ready 2 -R acme/widgets");
    expect(text(result)).toContain("pull/3 --until-terminal");
  });

  it("marks a draft ready before asking about a layer without a command", () => {
    const result = withPollSummaryInstructions(
      stack([disabledDraft(1, 1), row(2, 2, { pollCommand: undefined })]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).toContain("gh pr ready 1 -R acme/widgets");
    expect(text(result)).toContain(
      "PR #2 needs a one-PR session, but Shepherd could not produce its command. After autonomous shepherding, ask for direction.",
    );
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
  it("keeps a probe with work, or a flag without a command, as a session", () => {
    const failing = disabledDraft(1, 1, { action: "fix_code", reasons: ["failing-checks"] });
    const noCommand = disabledDraft(2, 2, { pollCommand: undefined });
    expect(splitStackWork([failing, noCommand], new Set())).toEqual({
      sessions: [failing, noCommand],
      markReady: [],
      idle: [],
    });
  });
});
