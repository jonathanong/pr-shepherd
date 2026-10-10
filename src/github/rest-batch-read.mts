import type { RepoInfo } from "./client.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { readRestPull, restPullRevision } from "./rest-pr-core.mts";
import { readRestSnapshot } from "./rest-batch-snapshot.mts";
import { restSummary } from "./rest-summary-read.mts";
import { markReadyAnnotationProbeComplete } from "./poll-summary-annotation-probe.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { GitHubRequestError } from "./errors.mts";
import { EXIT } from "../exit-codes.mts";
import type { RestSnapshotContext } from "./rest-snapshot-context.mts";
/** REST uses multiple resources; retry a moving head/base once rather than combining revisions. */
export async function fetchRestPrBatch(
  pr: number,
  repo: RepoInfo,
  opts: { includeReceiptSummary?: boolean; snapshotContext?: RestSnapshotContext } = {},
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const pull = await readRestPull(pr, repo);
    const snapshot = await readRestSnapshot(pull, repo, opts.snapshotContext);
    const latest = await readRestPull(pr, repo);
    if (restPullRevision(pull) !== restPullRevision(latest)) continue;
    opts.snapshotContext?.recordPullRevision(pr, restPullRevision(latest));
    const receiptSummary = restSummary(
      snapshot.data,
      pull,
      snapshot.feedback,
      snapshot.checks,
      snapshot.rules.baseRef,
    );
    // Match the canonical check window hashed by aggregate stack reconciliation.
    await hydratePollSummaryChecks(receiptSummary, repo);
    markReadyAnnotationProbeComplete(receiptSummary);
    return {
      data: snapshot.data,
      rateLimit: snapshot.checks.rateLimit,
      checkSuitesComplete: true,
      ...(snapshot.checks.suites.length === 0 && { headCheckSuitesEmpty: true as const }),
      headWorkflowSuites: snapshot.checks.suites.flatMap((suite) => {
        const run = snapshot.checks.workflowRuns.find((run) => run.check_suite_id === suite.id);
        return run
          ? [
              {
                status: suite.status.toUpperCase(),
                conclusion: suite.conclusion?.toUpperCase() ?? null,
                workflowRun: { event: run.event },
              },
            ]
          : [];
      }),
      ...(opts.includeReceiptSummary && { receiptSummary }),
    };
  }
  throw new GitHubRequestError("Pull request changed while REST snapshot was being read; retry", {
    status: 409,
    exitCodeOverride: EXIT.TEMPFAIL,
  });
}
export async function fetchRestRawSummaryPr(
  pr: number,
  repo: RepoInfo,
  snapshotContext?: RestSnapshotContext,
): Promise<RawSummaryPr> {
  const snapshot = await fetchRestPrBatch(pr, repo, {
    includeReceiptSummary: true,
    snapshotContext,
  });
  return snapshot.receiptSummary!;
}
