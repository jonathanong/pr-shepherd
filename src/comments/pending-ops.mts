import type { ResolveResult } from "./resolve.mts";

export type ResolveMutationOp =
  | { kind: "p"; id: string }
  | { kind: "r"; id: string }
  | { kind: "m"; id: string }
  | { kind: "d"; id: string };

export function setPendingOps(result: ResolveResult, ops: ResolveMutationOp[]): void {
  const resolved = new Set(result.resolvedThreads);
  const replied = new Set(result.repliedThreads);
  const minimized = new Set(result.minimizedComments);
  const dismissed = new Set(result.dismissedReviews);

  const unrepliedThreads = ops
    .filter(
      (op): op is Extract<ResolveMutationOp, { kind: "p" }> =>
        op.kind === "p" && !replied.has(op.id),
    )
    .map((op) => op.id);
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

  if (unrepliedThreads.length > 0) result.unrepliedThreads = unrepliedThreads;
  if (unresolvedThreads.length > 0) result.unresolvedThreads = unresolvedThreads;
  if (unminimizedComments.length > 0) result.unminimizedComments = unminimizedComments;
  if (undismissedReviews.length > 0) result.undismissedReviews = undismissedReviews;
}
