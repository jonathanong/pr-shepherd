import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";

function verification(pr: number, position: number) {
  return row(pr, position, {
    isDraft: true,
    action: "fix_code",
    reasons: ["draft-readiness-verification-required"],
    review: { incomplete: true },
    pollCommand: `pr-shepherd https://github.com/acme/widgets/pull/${pr} --timeout 1s --debounce 0s --no-auto-mark-ready`,
    pollProbe: true,
  });
}

function instructions(result: ReturnType<typeof withPollSummaryInstructions>): string {
  return result.instructions?.join("\n") ?? "";
}

describe("stack draft verification", () => {
  it("runs one final bounded probe for incomplete review evidence, then stops on a clean cancel", () => {
    const result = withPollSummaryInstructions(stack([verification(1, 1)]), false);
    expect(result).toMatchObject({ nextAction: "shepherd", reason: "actionable" });
    expect(instructions(result)).toContain(
      "pull/1 --timeout 1s --debounce 0s --no-auto-mark-ready",
    );
    expect(instructions(result)).toContain(
      "returns `[CANCEL]` with reason `auto-mark-ready-disabled`",
    );
    expect(instructions(result)).toContain("stop shepherding this stack");
    expect(instructions(result)).not.toContain("gh pr ready");
  });

  it("keeps reconciling pending CI beside an incomplete draft probe", () => {
    const result = withPollSummaryInstructions(
      stack([
        verification(1, 1),
        row(2, 2, {
          isDraft: true,
          action: "wait",
          reasons: ["pending-or-unknown"],
          checks: { inProgress: 1 },
          pollCommand: "pr-shepherd probe-2 --no-auto-mark-ready",
          pollProbe: true,
        }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(instructions(result)).toContain("rerun this same `--stack` selector");
    expect(instructions(result)).not.toContain("stop shepherding this stack");
  });

  it("stops after final verification beside a human handoff", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, { action: "escalate", reasons: ["fix-thrash"] }), verification(2, 2)]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(instructions(result)).toContain("report the human handoff above and stop this selector");
    expect(instructions(result)).toContain("If any probe returns `[ESCALATE]`");
  });
});
