import { ACTIONS_APP_SLUG, type WorkflowSuiteSnapshot } from "../checks/unreported-required.mts";
import type { RepoInfo } from "./client.mts";
import type { BatchResult } from "./batch.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { readRestPull, restPullRevision } from "./rest-pr-core.mts";
import { readRestSnapshot } from "./rest-batch-snapshot.mts";
import { isRestPullMerged, restMergedBatchData } from "./rest-terminal-batch.mts";
import { restSummary } from "./rest-summary-read.mts";
import { markReadyAnnotationProbeComplete } from "./poll-summary-annotation-probe.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { GitHubRequestError } from "./errors.mts";
import { normalizeWorkflowPath } from "../checks/workflow-path.mts";
import { EXIT } from "../exit-codes.mts";
import type { RestSnapshotContext } from "./rest-snapshot-context.mts";
/** REST uses multiple resources; retry a moving head/base once rather than combining revisions. */
export async function fetchRestPrBatch(
  pr: number,
  repo: RepoInfo,
  opts: {
    includeReceiptSummary?: boolean;
    terminalShortCircuit?: boolean;
    snapshotContext?: RestSnapshotContext;
    viewerLogin?: string | null;
  } = {},
): Promise<BatchResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const pull = await readRestPull(pr, repo);
    if (opts.terminalShortCircuit && isRestPullMerged(pull)) {
      return { data: restMergedBatchData(pull), checkSuitesComplete: true };
    }
    const snapshot = await readRestSnapshot(pull, repo, opts.snapshotContext, opts.viewerLogin);
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
      headWorkflowSuites: snapshot.checks.suites.flatMap((suite): WorkflowSuiteSnapshot[] => {
        const run = snapshot.checks.workflowRuns.find((run) => run.check_suite_id === suite.id);
        const status = suite.status.toUpperCase();
        const conclusion = suite.conclusion?.toUpperCase() ?? null;
        if (run)
          return [
            {
              status,
              conclusion,
              workflowRun: {
                event: run.event,
                databaseId: run.id,
                path: normalizeWorkflowPath(run.path) ?? null,
              },
            },
          ];
        // Actions creates its suites before their runs; third-party suites with no run are omitted.
        return suite.app?.slug === ACTIONS_APP_SLUG
          ? [{ status, conclusion, app: { slug: suite.app.slug } }]
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
  viewerLogin?: string | null,
): Promise<RawSummaryPr> {
  const snapshot = await fetchRestPrBatch(pr, repo, {
    includeReceiptSummary: true,
    snapshotContext,
    viewerLogin,
  });
  return snapshot.receiptSummary!;
}
