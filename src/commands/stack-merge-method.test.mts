import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";

const ready = { readyReceipt: true } as const;

describe("stack merge method", () => {
  it("uses merge commits when squash is disabled", () => {
    const result = withPollSummaryInstructions(
      {
        ...stack([row(1, 1, ready)]),
        allowedMergeMethods: ["merge"],
      },
      true,
    );
    expect(result.nextAction).toBe("merge");
    expect(result.instructions?.[0]).toContain("gh stack merge 1 --yes --merge");
    expect(result.instructions?.[0]).not.toContain("--squash");
  });

  it("escalates when the repository allows no merge method", () => {
    const result = withPollSummaryInstructions(
      {
        ...stack([row(1, 1, ready)]),
        allowedMergeMethods: [],
      },
      true,
    );
    expect(result.nextAction).toBe("escalate");
    expect(result.instructions?.join("\n")).toContain("allows no merge method");
    expect(result.instructions?.join("\n")).not.toContain("gh stack merge");
  });
});
