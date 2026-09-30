import type { RepoInfo } from "./client.mts";
import type { RawContextNode, RawPr } from "./batch-raw-types.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { markReadyAnnotationProbeComplete } from "./poll-summary-annotation-probe.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

/** Keep the exact PollSummaryPr shape used by v1 receipts; add only complete annotation totals. */
export async function prepareBatchReceiptEvidence(
  summary: RawSummaryPr | null | undefined,
  batch: RawPr,
  checks: RawContextNode[],
  repo: RepoInfo,
): Promise<RawSummaryPr | null> {
  if (
    !summary ||
    summary.number !== batch.number ||
    summary.headRefOid !== batch.headRefOid ||
    summary.baseRefOid !== batch.baseRefOid
  )
    return null;
  // Candidate evidence is best-effort. Wider windows need their own summary
  // pagination, so use the existing standalone receipt path instead of issuing
  // follow-ups from inside a full BatchPr read (which may have exhausted quota).
  const headContexts = summary.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  const queueContexts = summary.mergeQueueEntry?.headCommit?.statusCheckRollup?.contexts;
  if (headContexts?.pageInfo.hasPreviousPage || queueContexts?.pageInfo.hasPreviousPage)
    return null;
  try {
    await hydratePollSummaryChecks(summary, repo);
  } catch {
    return null;
  }
  if (summary.mergeQueueEntry?.headCommit?.statusCheckRollup?.contexts.pageInfo.hasPreviousPage)
    return null;
  const summaryCommit = summary.commits.nodes[0]?.commit;
  const batchCommit = batch.commits.nodes[0]?.commit;
  if (!summaryCommit || summaryCommit.oid !== batchCommit?.oid) return null;
  const contexts = summaryCommit.statusCheckRollup?.contexts;
  if (!contexts) {
    if (batchCommit.statusCheckRollup !== null || checks.length > 0) return null;
    markReadyAnnotationProbeComplete(summary);
    return summary;
  }
  if (contexts.pageInfo.hasPreviousPage || contexts.nodes.length !== contexts.totalCount)
    return null;
  if (checks.length !== contexts.totalCount) return null;
  const batchRuns = new Map<string, number>();
  for (const check of checks) {
    if (check.__typename !== "CheckRun") continue;
    const count = check.annotations?.totalCount;
    if (!Number.isSafeInteger(count) || count! < 0 || batchRuns.has(check.id)) return null;
    batchRuns.set(check.id, count!);
  }
  const summaryRuns = contexts.nodes.filter((node) => node.__typename === "CheckRun");
  if (summaryRuns.length !== batchRuns.size) return null;
  const seenSummaryIds = new Set<string>();
  for (const node of summaryRuns) {
    if (!node.id || seenSummaryIds.has(node.id) || !batchRuns.has(node.id)) return null;
    seenSummaryIds.add(node.id);
    node.annotations = { totalCount: batchRuns.get(node.id)! };
  }
  markReadyAnnotationProbeComplete(summary);
  return summary;
}
