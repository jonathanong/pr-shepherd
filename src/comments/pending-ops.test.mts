import { describe, expect, it } from "vitest";
import { setPendingOps, type ResolveMutationOp } from "./pending-ops.mts";
import type { ResolveResult } from "./resolve.mts";

function makeResult(overrides: Partial<ResolveResult> = {}): ResolveResult {
  return {
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
    ...overrides,
  };
}

describe("setPendingOps", () => {
  it("records unresolved, unminimized, and undismissed IDs not already completed", () => {
    const result = makeResult({
      resolvedThreads: ["t-done"],
      minimizedComments: ["c-done"],
      dismissedReviews: ["r-done"],
    });
    const ops: ResolveMutationOp[] = [
      { kind: "r", id: "t-done" },
      { kind: "r", id: "t-pending" },
      { kind: "m", id: "c-done" },
      { kind: "m", id: "c-pending" },
      { kind: "d", id: "r-done" },
      { kind: "d", id: "r-pending" },
    ];

    setPendingOps(result, ops);

    expect(result.unresolvedThreads).toEqual(["t-pending"]);
    expect(result.unminimizedComments).toEqual(["c-pending"]);
    expect(result.undismissedReviews).toEqual(["r-pending"]);
  });

  it("omits pending arrays when all IDs already completed", () => {
    const result = makeResult({
      resolvedThreads: ["t-done"],
      minimizedComments: ["c-done"],
      dismissedReviews: ["r-done"],
    });

    setPendingOps(result, [
      { kind: "r", id: "t-done" },
      { kind: "m", id: "c-done" },
      { kind: "d", id: "r-done" },
    ]);

    expect(result.unresolvedThreads).toBeUndefined();
    expect(result.unminimizedComments).toBeUndefined();
    expect(result.undismissedReviews).toBeUndefined();
  });
});
