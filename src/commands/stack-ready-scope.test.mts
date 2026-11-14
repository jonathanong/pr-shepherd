import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { planStackMerge } from "./stack-merge-plan.mts";

const READY = { kind: "ready" } as const;
const ready = { readyReceipt: true } as const;

describe("planStackMerge ready scope", () => {
  it("selects the highest ready open layer regardless of row order", () => {
    const plan = planStackMerge(
      stack([
        row(3, 3),
        row(2, 2, { ...ready, baseRefName: "main" }),
        row(1, 1, { state: "MERGED" }),
      ]),
      READY,
    );
    expect(plan?.instructions[0]).toContain("gh stack merge 2 --yes --squash");
    expect(plan?.instructions[0]).toContain("PR #2 alone");
  });

  it.each([
    ["an unready bottom", [row(1, 1), row(2, 2, ready)]],
    ["an escalated bottom", [row(1, 1, { ...ready, action: "escalate" }), row(2, 2)]],
    ["a bottom without stack metadata", [row(1, 1, { ...ready, stack: undefined })]],
    ["a queued upper layer", [row(1, 1, ready), row(2, 2, { ...ready, isInMergeQueue: true })]],
    ["no open layer", [row(1, 1, { state: "MERGED" })]],
  ] as const)("returns nothing for %s", (_case, prs) => {
    expect(planStackMerge(stack([...prs]), READY)).toBeUndefined();
  });
});
