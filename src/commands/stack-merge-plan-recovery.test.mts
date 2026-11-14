import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryResult } from "../types.mts";
import { planStackMerge } from "./stack-merge-plan.mts";

const ready = { readyReceipt: true } as const;
const RERUN = "pr-shepherd stack https://github.com/acme/widgets/pull/3 --until-terminal --merge";

function listed(result: PollSummaryResult, owned: number[]): PollSummaryResult {
  return {
    ...result,
    selection: { ...(result.selection as { kind: "stack" }), owned },
    prs: result.prs.map((item) => ({ ...item, owned: owned.includes(item.pr) })),
  } as PollSummaryResult;
}

describe("unapproved layer recovery", () => {
  it("offers --merge-through only when the new layer sits above the approved ones", () => {
    const above = stack([row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)]);
    const aboveText = planStackMerge({ ...above, addedLayers: [3] }, { kind: "all" }, RERUN);
    expect(aboveText!.instructions[0]).toContain("`--merge-through 2`");
    const below = stack([row(1, 1, ready), row(9, 2, ready), row(2, 3, ready)]);
    const belowText = planStackMerge({ ...below, addedLayers: [9] }, { kind: "all" }, RERUN);
    expect(belowText!.instructions[0]).toContain("do not use `--merge-through`");
    const none = stack([row(1, 1, ready)]);
    const noneText = planStackMerge({ ...none, addedLayers: [1] }, { kind: "all" }, RERUN);
    expect(noneText!.instructions[0]).toContain("If no, merge nothing.");
  });
});

describe("--merge-ready with an unowned ready bottom layer", () => {
  it("escalates instead of waiting when owned layers sit above it", () => {
    const result = listed(stack([row(1, 1, ready), row(2, 2, ready)]), [2]);
    const plan = planStackMerge(result, { kind: "ready" }, RERUN);
    expect(plan).toMatchObject({ action: "escalate" });
    expect(plan!.instructions[0]).toContain("`unowned-stack-layers`: merging PR #2 also merges #1");
  });

  it("still waits when the unowned bottom layer is not ready", () => {
    const result = listed(stack([row(1, 1), row(2, 2, ready)]), [2]);
    expect(planStackMerge(result, { kind: "ready" }, RERUN)).toBeUndefined();
  });
});
