import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryResult } from "../types.mts";
import {
  applyStackOwnership,
  listedLayerLeftStack,
  missingListedLayers,
  ownershipBoundaryStep,
} from "./stack-ownership.mts";

const ready = { readyReceipt: true } as const;

function listed(result: PollSummaryResult, owned: number[]): PollSummaryResult {
  return {
    ...result,
    selection: { ...(result.selection as { kind: "stack" }), owned },
    prs: result.prs.map((item) => ({ ...item, owned: owned.includes(item.pr) })),
  } as PollSummaryResult;
}

describe("ownershipBoundaryStep", () => {
  it("does not apply when the caller owns the whole stack or outside a stack", () => {
    expect(ownershipBoundaryStep(stack([row(1, 1), row(2, 2)]))).toBeUndefined();
    const prs: PollSummaryResult = {
      ...stack([row(1, 1)]),
      selection: { kind: "prs", requested: [1] },
    };
    expect(ownershipBoundaryStep(prs)).toBeUndefined();
  });

  it("does not apply when no unowned layer is open or no owned layer needs work", () => {
    expect(
      ownershipBoundaryStep(listed(stack([row(1, 1), row(2, 2, { state: "MERGED" })]), [1])),
    ).toBeUndefined();
    expect(
      ownershipBoundaryStep(listed(stack([row(1, 1, ready), row(2, 2, ready)]), [1])),
    ).toBeUndefined();
  });

  it("bounds the update below the first unowned layer and never pushes it", () => {
    const result = listed(stack([row(1, 1), row(2, 2), row(3, 3)]), [1, 2]);
    const step = ownershipBoundaryStep(result)!;
    expect(result.prs).toHaveLength(3);
    expect(step).toContain("unowned layer #3 sits in this stack and must not be rebased or pushed");
    expect(step).toContain("check out `layer-2` (PR #2), run `gh stack rebase --downstack`");
    expect(step).toContain("push only the owned branches (`layer-1`, `layer-2`)");
    expect(step).toContain("`git push --force-with-lease <push-remote> <branch>`");
    expect(step).toContain("substitute this repository's push remote");
    expect(step).toContain(
      "#3 (and anything above) will be stale: tell the user their owner must restack it",
    );
  });

  it("stops at the first unowned layer even when owned layers sit above it", () => {
    const result = listed(stack([row(1, 1), row(2, 2, ready), row(3, 3)]), [1, 3]);
    const step = ownershipBoundaryStep(result)!;
    expect(step).toContain("check out `layer-1` (PR #1)");
    expect(step).toContain("push only the owned branches (`layer-1`)");
    expect(step).toContain("Owned layers above #2 cannot be restacked this way.");
  });

  it("names several unowned layers in the plural", () => {
    const result = listed(stack([row(1, 1), row(2, 2), row(3, 3)]), [1]);
    const step = ownershipBoundaryStep(result)!;
    expect(step).toContain("unowned layers #2, #3 sit in this stack");
    expect(step).toContain("tell the user their owner must restack them");
  });

  it("refuses any update when no owned layer sits below the first unowned layer", () => {
    const result = listed(stack([row(1, 1, ready), row(2, 2)]), [2]);
    const step = ownershipBoundaryStep(result)!;
    expect(step).toContain("No owned layer sits below the first unowned layer (#1)");
    expect(step).toContain(
      "Do not rebase or push; report that the owned layers wait on #1's owner.",
    );
    expect(step).not.toContain("--downstack");
  });

  it("counts a stale owned layer as work even when it looks ready", () => {
    const all = [row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)];
    const step = ownershipBoundaryStep(listed(stack(all, true), [1, 3]));
    expect(step).toContain("check out `layer-1`");
  });
});

describe("applyStackOwnership", () => {
  const selection = { kind: "stack", anchor: 3, stackNumber: 9, stackSize: 3 } as const;
  const prs = [row(1, 1, { owned: undefined }), row(2, 2), row(3, 3)];

  it("owns every layer when none were listed and ignores the PR author", () => {
    const result = applyStackOwnership(selection, prs, undefined);
    expect(result.selection).toEqual(selection);
    expect(result.prs.every((item) => item.owned === true)).toBe(true);
  });

  it("owns only the listed PRs and records them on the selection", () => {
    const result = applyStackOwnership(selection, prs, [2]);
    expect(result.selection).toEqual({ ...selection, owned: [2] });
    expect(result.prs.map((item) => item.owned)).toEqual([undefined, true, undefined]);
  });

  it("does not throw for a listed PR that left the stack, and reports it as missing", () => {
    expect(() => applyStackOwnership(selection, prs, [2, 8])).not.toThrow();
    expect(missingListedLayers(prs, [2, 8])).toEqual([8]);
    expect(missingListedLayers(prs, undefined)).toEqual([]);
  });

  it("escalates with a dedicated reason when listed PRs left the stack", () => {
    const base = { ...stack([row(1, 1)]), selection };
    const one = listedLayerLeftStack(base, [8], "`rerun`");
    expect(one).toMatchObject({ nextAction: "escalate", stackMergeable: false });
    expect(one.instructions![0]).toContain(
      "`listed-pr-left-stack`: PR #8 is no longer in native stack #9",
    );
    expect(one.instructions![0]).toContain("rerun `rerun` with only the PRs that remain");
    const many = listedLayerLeftStack(base, [7, 8], "`rerun`");
    expect(many.instructions![0]).toContain("PR #7, PR #8 are no longer");
  });

  it("hands each owned row's one-PR command the layer ownership when some layer is unlisted", () => {
    const withCommands = prs.map((item) => ({
      ...item,
      state: "OPEN" as const,
      stack: { number: 9, size: 3, position: item.pr, baseRefName: "main" },
      pollCommand: `pr-shepherd iterate https://github.com/o/r/pull/${item.pr}`,
    }));
    const partial = applyStackOwnership(selection, withCommands, [2]);
    const [first, second, third] = partial.prs;
    expect(first!.pollCommand).not.toContain("--layers");
    expect(second!.pollCommand).toContain("--layers");
    expect(second!.pollCommand).toContain(":o:");
    expect(second!.pollCommand).toContain(":u:");
    expect(third!.pollCommand).not.toContain("--layers");
    const whole = applyStackOwnership(selection, withCommands, undefined);
    expect(whole.prs.every((item) => !item.pollCommand!.includes("--layers"))).toBe(true);
    const everyone = applyStackOwnership(selection, withCommands, [1, 2, 3]);
    expect(everyone.prs.every((item) => !item.pollCommand!.includes("--layers"))).toBe(true);
  });
});
