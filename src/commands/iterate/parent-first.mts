import { fetchPollSummary } from "../../github/poll-summary.mts";
import type { RepoInfo } from "../../github/client.mts";
import type {
  IterateResult,
  ShepherdReport,
  StackDraftHold,
  StackLowerLayerBlock,
} from "../../types.mts";
import { stackLayerBlockReason } from "../stack-layer-readiness.mts";

/**
 * What keeps a draft child from being marked ready: the lowest blocking lower layer,
 * or a stack read that could not attribute the block to one.
 */
export type ParentMarkReadyBlock = StackLowerLayerBlock | "unverifiable";

/**
 * Draft children may only be converted after their immediate parent has
 * independently completed a one-PR ready-delay and the stack boundary is
 * still linear.  A failed or incomplete stack read blocks this mutation but
 * does not block ordinary review/CI work in the caller.
 */
export async function findParentMarkReadyBlock(
  report: ShepherdReport,
  repo: RepoInfo,
): Promise<ParentMarkReadyBlock | undefined> {
  const stack = report.mergeStatus.mergeRequirements?.stack;
  if (!stack || stack.position === 1) return undefined;
  if (stack.position < 1) return "unverifiable";

  try {
    const summary = await fetchPollSummary({ stackPrNumber: report.pr }, repo);
    const child = summary.prs.find((item) => item.pr === report.pr);
    const lowerLayers = summary.prs
      .filter((item) => (item.stack?.position ?? Number.MAX_SAFE_INTEGER) < stack.position)
      .sort(
        (left, right) =>
          (left.stack?.position ?? Number.MAX_SAFE_INTEGER) -
          (right.stack?.position ?? Number.MAX_SAFE_INTEGER),
      );
    if (!child || child.state !== "OPEN" || lowerLayers.length !== stack.position - 1)
      return "unverifiable";
    // A stale boundary means that layer is no longer based on the parent it was
    // reviewed against. Gaps above this child do not affect its promotion boundary.
    const staleChildren = new Set(summary.stackAncestry?.map((gap) => gap.childPr));
    for (const layer of lowerLayers) {
      // A merged layer is already satisfied; GitHub may have retargeted the
      // layer above it to the trunk as part of the merge.
      if (layer.state === "MERGED") continue;
      const reason = staleChildren.has(layer.pr) ? "stale-ancestry" : stackLayerBlockReason(layer);
      if (reason) return { pr: layer.pr, reason };
    }
    // This layer's own stale boundary belongs to its own session's repair; the
    // earlier stale-ancestry read missed it, so this snapshot is unsettled.
    return staleChildren.has(report.pr) ? "unverifiable" : undefined;
  } catch {
    // Never convert a child draft based on an unverifiable parent.
    return "unverifiable";
  }
}

/**
 * A native stack draft this one-PR session cannot promote: a lower layer blocks it, or
 * automatic mark-ready is off. Undefined when the session can still advance the PR by
 * iterating.
 */
export function stackDraftHold(
  report: ShepherdReport,
  autoMarkReady: boolean,
  parentBlock: ParentMarkReadyBlock | undefined,
): StackDraftHold | undefined {
  if (!report.mergeStatus.mergeRequirements?.stack || !report.mergeStatus.isDraft) return undefined;
  // Any lower-layer block outranks the session flag: even with automatic
  // mark-ready enabled, this draft cannot advance until that layer does, and a
  // lower-layer read that failed must not hide behind the flag.
  if (parentBlock === "unverifiable") return { kind: "lower-layer-not-ready" };
  if (parentBlock) return { kind: "lower-layer-not-ready", lowerLayer: parentBlock };
  return autoMarkReady ? undefined : { kind: "auto-mark-ready-disabled" };
}

/**
 * The lower layer a held draft waits on. That layer's own session owns this draft's
 * progress, so the draft neither stalls nor keeps polling while it waits.
 */
export function heldByLowerLayer(result: IterateResult): StackLowerLayerBlock | undefined {
  return result.action === "wait" && result.stackDraftHold?.kind === "lower-layer-not-ready"
    ? result.stackDraftHold.lowerLayer
    : undefined;
}
