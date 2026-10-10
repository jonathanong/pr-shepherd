import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryItem } from "../types.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";

function unowned(item: PollSummaryItem): PollSummaryItem {
  const { owned: _owned, ...rest } = item;
  return rest;
}

describe("stack handoffs with only unowned autonomous work", () => {
  it("escalates instead of deferring a handoff behind another author's layers", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, {
          action: "escalate",
          reasons: ["mark-ready-authorization-required"],
          isDraft: true,
          pollCommand: undefined,
        }),
        unowned(row(2, 2, { action: "fix_code", reasons: ["review-work"] })),
      ]),
      false,
    );
    const text = result.instructions?.join("\n") ?? "";
    expect(result.nextAction).toBe("escalate");
    expect(text).toContain("PR #1 requires human action (mark-ready-authorization-required). Stop");
    expect(text).not.toContain("Keep shepherding other PRs");
    expect(text).not.toContain("Report this overview and stop");
    expect(text).not.toContain("rerun this same `--stack` selector");
  });

  it("stops to ask about a missing command when every runnable layer is unowned", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { action: "fix_code", pollCommand: undefined }),
        unowned(row(2, 2, { action: "fix_code" })),
      ]),
      false,
    );
    const text = result.instructions?.join("\n") ?? "";
    expect(result.nextAction).toBe("escalate");
    expect(text).toContain(
      "PR #1 needs a one-PR session, but Shepherd could not produce its command. Stop and ask",
    );
    expect(text).not.toContain("rerun this same `--stack` selector");
  });
});
