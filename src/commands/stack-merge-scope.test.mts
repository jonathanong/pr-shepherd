import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { readApprovedLayers } from "../state/stack-merge-approval.mts";
import type { PollSummaryResult } from "../types.mts";
import {
  mergeScopeLayers,
  openLayers,
  readyPrefix,
  requestedMergeScope,
  stackAddedLayers,
  stackPosition,
} from "./stack-merge-scope.mts";

const ready = { readyReceipt: true } as const;
const CMD = "pr-shepherd stack acme/widgets#1 --until-terminal --merge";

describe("requestedMergeScope", () => {
  it("prefers an explicit scope and treats a bare merge as all", () => {
    expect(requestedMergeScope({ stackMerge: { kind: "ready" }, merge: true })).toEqual({
      kind: "ready",
    });
    expect(requestedMergeScope({ merge: true })).toEqual({ kind: "all" });
    expect(requestedMergeScope({})).toBeUndefined();
  });
});

describe("layer helpers", () => {
  it("orders open layers by position and sorts layers without a stack last", () => {
    const loose = row(9, 1, { stack: undefined });
    const result = stack([row(3, 3), loose, row(1, 1), row(2, 2, { state: "MERGED" })]);
    expect(openLayers(result).map((item) => item.pr)).toEqual([1, 3, 9]);
    expect(stackPosition(loose)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("readyPrefix", () => {
  it("is empty while a layer is in the merge queue or the bottom is not on trunk", () => {
    expect(readyPrefix(stack([row(1, 1, { ...ready, isInMergeQueue: true })]), false)).toEqual([]);
    expect(readyPrefix(stack([row(2, 2, ready)]), false)).toEqual([]);
    expect(readyPrefix(stack([]), false)).toEqual([]);
    expect(readyPrefix(stack([row(1, 1, { ...ready, stack: undefined })]), false)).toEqual([]);
  });

  it("ends at a layer that is not ready, escalated, stale, or above a closed layer", () => {
    const base = [row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)];
    expect(readyPrefix(stack(base), false).map((item) => item.pr)).toEqual([1, 2, 3]);
    expect(readyPrefix(stack([base[0]!, row(2, 2), base[2]!]), false)).toHaveLength(1);
    expect(
      readyPrefix(stack([base[0]!, row(2, 2, { ...ready, action: "escalate" }), base[2]!]), false),
    ).toHaveLength(1);
    expect(readyPrefix(stack(base, true), false).map((item) => item.pr)).toEqual([1, 2]);
    const closed = [row(1, 1, { state: "CLOSED" }), row(2, 2, { ...ready, baseRefName: "main" })];
    expect(readyPrefix(stack(closed), false)).toEqual([]);
    const loose = [row(1, 1, ready), row(2, 2, { ...ready, stack: undefined })];
    expect(readyPrefix(stack(loose), false)).toHaveLength(1);
  });

  it("ends at the first unowned layer when asked for owned layers only", () => {
    const base = stack([
      row(1, 1, ready),
      row(2, 2, { ...ready, owned: undefined }),
      row(3, 3, ready),
    ]);
    expect(readyPrefix(base, true).map((item) => item.pr)).toEqual([1]);
    expect(readyPrefix(base, false).map((item) => item.pr)).toEqual([1, 2, 3]);
  });
});

describe("mergeScopeLayers", () => {
  const result = stack([row(1, 1), row(2, 2, { owned: undefined }), row(3, 3)]);

  it("covers every owned open layer for all", () => {
    const { inScope, target } = mergeScopeLayers(result, { kind: "all" });
    expect(inScope.map((item) => item.pr)).toEqual([1, 3]);
    expect(target?.pr).toBe(3);
  });

  it("covers only owned open layers up to the through PR", () => {
    const { inScope, target } = mergeScopeLayers(result, { kind: "through", pr: 3 });
    expect(inScope.map((item) => item.pr)).toEqual([1, 3]);
    expect(target?.pr).toBe(3);
  });

  it("has no target once the through PR is closed, instead of falling to a lower layer", () => {
    const closed = stack([row(1, 1), row(2, 2, { state: "CLOSED" })]);
    const { inScope, target } = mergeScopeLayers(closed, { kind: "through", pr: 2 });
    expect(target).toBeUndefined();
    expect(inScope).toEqual([]);
  });

  it("covers nothing when the through PR is not in the stack", () => {
    expect(mergeScopeLayers(result, { kind: "through", pr: 99 }).inScope).toEqual([]);
  });
});

let counter = 0;
function fresh(prs: ReturnType<typeof row>[], owned?: number[]): PollSummaryResult {
  const result = stack(prs);
  return {
    ...result,
    selection: {
      kind: "stack",
      anchor: 1,
      stackNumber: 7000 + ++counter,
      stackSize: prs.length,
      ...(owned && { owned }),
    },
  };
}

function keyOf(result: PollSummaryResult, scope: string) {
  const selection = result.selection as { stackNumber: number };
  return { owner: "acme", repo: "widgets", stack: selection.stackNumber, scope };
}

describe("stackAddedLayers", () => {
  it("does nothing without a scope or outside a stack", async () => {
    const result = fresh([row(1, 1)]);
    expect(await stackAddedLayers(result, undefined, CMD)).toEqual([]);
    const prs = { ...result, selection: { kind: "prs" as const, requested: [1] } };
    expect(await stackAddedLayers(prs, { kind: "all" }, CMD)).toEqual([]);
  });

  it("needs no record when the caller listed its PRs", async () => {
    const result = fresh([row(1, 1), row(2, 2)], [1]);
    expect(await stackAddedLayers(result, { kind: "all" }, CMD)).toEqual([]);
    expect(await readApprovedLayers(keyOf(result, "all"), CMD)).toBeNull();
  });

  it("records the first tick's layers and reports one that joins later", async () => {
    const first = fresh([row(1, 1), row(2, 2)]);
    expect(await stackAddedLayers(first, { kind: "all" }, CMD)).toEqual([]);
    expect(await stackAddedLayers(first, { kind: "all" }, CMD)).toEqual([]);
    const grown = { ...first, prs: [...first.prs, row(3, 3)] };
    expect(await stackAddedLayers(grown, { kind: "all" }, CMD)).toEqual([3]);
    // A merged layer is not an addition, and the record survives it.
    const merged = { ...first, prs: [row(1, 1, { state: "MERGED" }), row(2, 2)] };
    expect(await stackAddedLayers(merged, { kind: "all" }, CMD)).toEqual([]);
  });

  it("keeps a record per through target and drops it once nothing in scope is open", async () => {
    const first = fresh([row(1, 1), row(2, 2), row(3, 3)]);
    const scope = { kind: "through", pr: 2 } as const;
    expect(await stackAddedLayers(first, scope, CMD)).toEqual([]);
    const key = keyOf(first, "through-2");
    expect(await readApprovedLayers(key, CMD), CMD).toEqual([1, 2]);
    const done = {
      ...first,
      prs: first.prs.map((item) => ({ ...item, state: "MERGED" as const })),
    };
    expect(await stackAddedLayers(done, scope, CMD)).toEqual([]);
    expect(await readApprovedLayers(key, CMD), CMD).toBeNull();
  });

  it("covers --merge-ready: a layer that joins later is reported", async () => {
    const first = fresh([row(1, 1), row(2, 2)]);
    const ready = { kind: "ready" } as const;
    expect(await stackAddedLayers(first, ready, CMD)).toEqual([]);
    const grown = { ...first, prs: [...first.prs, row(3, 3)] };
    expect(await stackAddedLayers(grown, ready, CMD)).toEqual([3]);
  });

  it("treats a different command line as a new request with a fresh record", async () => {
    const first = fresh([row(1, 1), row(2, 2)]);
    expect(await stackAddedLayers(first, { kind: "all" }, CMD)).toEqual([]);
    const grown = { ...first, prs: [...first.prs, row(3, 3)] };
    expect(await stackAddedLayers(grown, { kind: "all" }, `${CMD} --ready-delay 5m`)).toEqual([]);
    expect(await stackAddedLayers(grown, { kind: "all" }, `${CMD} --ready-delay 5m`)).toEqual([]);
  });
});
