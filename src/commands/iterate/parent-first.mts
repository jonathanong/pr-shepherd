import { fetchPollSummary } from "../../github/poll-summary.mts";
import type { RepoInfo } from "../../github/client.mts";
import type { ShepherdReport } from "../../types.mts";

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
      .sort((left, right) => (left.stack?.position ?? 0) - (right.stack?.position ?? 0));
    if (!child || child.state !== "OPEN" || lowerLayers.length !== stack.position - 1) return true;
    if (summary.stackAncestry?.some((gap) => gap.childPr === report.pr)) return true;
    for (const parent of lowerLayers) {
      // A merged parent is already satisfied; GitHub may have retargeted the
      // child to the trunk as part of the merge.
      if (parent.state === "MERGED") continue;
      if (parent.state !== "OPEN") return true;
      if (parent.isDraft || parent.mergeable === "CONFLICTING") return true;
      if (["DIRTY", "BEHIND", "UNKNOWN"].includes(parent.mergeStateStatus)) return true;
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
