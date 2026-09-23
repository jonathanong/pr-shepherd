import { fetchPollSummary } from "../../github/poll-summary.mts";
import type { RepoInfo } from "../../github/client.mts";
import type { ShepherdReport, StackDraftHold } from "../../types.mts";

/**
 * Draft children may only be converted after their immediate parent has
 * independently completed a one-PR ready-delay and the stack boundary is
 * still linear.  A failed or incomplete stack read blocks this mutation but
 * does not block ordinary review/CI work in the caller.
 */
export async function parentBlocksMarkReady(
  report: ShepherdReport,
  repo: RepoInfo,
): Promise<boolean> {
  const stack = report.mergeStatus.mergeRequirements?.stack;
  if (!stack || stack.position === 1) return false;
  if (stack.position < 1) return true;

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
    if (!child || child.state !== "OPEN" || lowerLayers.length !== stack.position - 1) return true;
    // Any stale boundary up through the child means at least one lower layer
    // is no longer the base it was reviewed against. Ignore gaps above this
    // child because they do not affect its immediate promotion boundary.
    const checkedLayers = new Set([report.pr, ...lowerLayers.map((item) => item.pr)]);
    if (summary.stackAncestry?.some((gap) => checkedLayers.has(gap.childPr))) return true;
    for (const parent of lowerLayers) {
      // A merged parent is already satisfied; GitHub may have retargeted the
      // child to the trunk as part of the merge.
      if (parent.state === "MERGED") continue;
      if (parent.state !== "OPEN") return true;
      if (parent.isDraft || parent.mergeable === "CONFLICTING") return true;
      if (["DIRTY", "BEHIND", "UNKNOWN"].includes(parent.mergeStateStatus)) return true;
      // A receipt only establishes readiness after a merge-queue removal once
      // the one-PR session has observed and acknowledged that exact removal.
      // The aggregate projection preserves an unacknowledged removal here, so
      // do not let its otherwise-current receipt promote a child draft.
      if (parent.queueRemoval) return true;
      // A parent that looks ready but has not completed its own one-PR receipt
      // is not sufficient evidence for a child draft transition.
      if (parent.readyReceipt !== true) return true;
    }
    return false;
  } catch {
    // Never convert a child draft based on an unverifiable parent.
    return true;
  }
}

/**
 * A native stack draft this one-PR session cannot promote: automatic mark-ready is
 * off, or a lower layer has not reached its own ready receipt. Undefined when the
 * session can still advance the PR by iterating.
 */
export function stackDraftHold(
  report: ShepherdReport,
  autoMarkReady: boolean,
  blockedByParent: boolean,
): StackDraftHold | undefined {
  if (!report.mergeStatus.mergeRequirements?.stack || !report.mergeStatus.isDraft) return undefined;
  if (!autoMarkReady) return "auto-mark-ready-disabled";
  return blockedByParent ? "lower-layer-not-ready" : undefined;
}
