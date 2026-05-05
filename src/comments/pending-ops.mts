import type { ResolveResult } from "./resolve.mts";

export type ResolveMutationOp =
  | { kind: "r"; id: string }
  | { kind: "m"; id: string }
  | { kind: "d"; id: string };

export function setPendingOps(result: ResolveResult, ops: ResolveMutationOp[]): void {
  const resolved = new Set(result.resolvedThreads);
  const minimized = new Set(result.minimizedComments);
  const dismissed = new Set(result.dismissedReviews);

  const unresolvedThreads = ops
    .filter(
      (op): op is Extract<ResolveMutationOp, { kind: "r" }> =>
        op.kind === "r" && !resolved.has(op.id),
    )
    .map((op) => op.id);
  const unminimizedComments = ops
    .filter(
      (op): op is Extract<ResolveMutationOp, { kind: "m" }> =>
        op.kind === "m" && !minimized.has(op.id),
    )
    .map((op) => op.id);
  const undismissedReviews = ops
    .filter(
      (op): op is Extract<ResolveMutationOp, { kind: "d" }> =>
        op.kind === "d" && !dismissed.has(op.id),
    )
    .map((op) => op.id);

  if (unresolvedThreads.length > 0) result.unresolvedThreads = unresolvedThreads;
  if (unminimizedComments.length > 0) result.unminimizedComments = unminimizedComments;
  if (undismissedReviews.length > 0) result.undismissedReviews = undismissedReviews;
}
