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
  it("hands a clean, unblocked disabled draft's ready transition to the agent", () => {
    const result = withPollSummaryInstructions(
      stack([disabledDraft(1, 1), row(2, 2, { isDraft: true })]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "shepherd", reason: "actionable" });
    expect(text(result)).toContain(`Run \`${probe(1)}\` first.`);
    expect(text(result)).toContain(
      "If it returns `[WAIT]` saying PR #1 stays in draft because automatic mark-ready is disabled for this session, run `gh pr ready 1 -R acme/widgets`; otherwise complete its instructions and leave PR #1 in draft this round.",
    );
    expect(text(result)).not.toContain("pull/2");
    expect(text(result)).not.toContain("human action");
  });

  it("waits at the polling cadence when every remaining probe could only report waiting", () => {
    const result = withPollSummaryInstructions(
      stack([
        disabledDraft(1, 1, { reasons: ["pending-or-unknown"], checks: { inProgress: 1 } }),
        row(2, 2, { isDraft: true }),
      ]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "wait", reason: "waiting", stackMergeable: false });
    expect(result.instructions).toEqual([
      "1. No one-PR session can advance the stack yet: PR #1 (pending-or-unknown); PR #2 (stack-blocked by PR #1). Recheck at the configured polling cadence.",
    ]);
  });

  it("escalates a held draft above a layer that needs a human", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { action: "escalate", reasons: ["fix-thrash"] }),
        row(2, 2, { isDraft: true }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("escalate");
    expect(text(result)).toContain(
      "PR #1 requires human action (fix-thrash). Stop for that decision.",
    );
    expect(text(result)).not.toContain("pull/2");
  });

  it("keeps a held draft's review work above a layer that needs a human", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { action: "escalate", reasons: ["fix-thrash"] }),
        row(2, 2, { isDraft: true, action: "fix_code", reasons: ["review-work"] }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).toContain(`Run \`${probe(2)}\` for PR #2 (stack-blocked by PR #1).`);
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
    expect(text(result)).not.toContain("pull/3");
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
