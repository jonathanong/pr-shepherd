/**
 * `shepherd check [PR]`
 *
 * Read-only snapshot of PR status. Fetches CI + comments + merge status in
 * one GraphQL request, applies all classifiers, and returns a ShepherdReport.
 *
 * Exit codes:
 *   0  READY — all checks passed, no unresolved threads, CLEAN merge status.
 *   1  FAILING — CI has red checks, or merge has conflicts.
 *   1  PENDING — CI passing but merge blocked (BLOCKED, UNSTABLE, or BEHIND).
 *   1  UNKNOWN — merge state unresolvable.
 *   2  IN_PROGRESS — CI checks still running.
 *   3  UNRESOLVED_COMMENTS — CI ok but actionable threads remain.
 */

import { fetchPrBatch } from "../github/batch.mts";
import { getRepoInfo, getCurrentPrNumber, getMergeableState } from "../github/client.mts";
import { classifyChecks, getCiVerdict } from "../checks/classify.mts";
import { triageFailingChecks } from "../checks/triage.mts";
import { getOutdatedThreads } from "../comments/outdated.mts";
import { autoResolveOutdated } from "../comments/resolve.mts";
import { deriveMergeStatus } from "../merge-status/derive.mts";
import { loadConfig } from "../config/load.mts";
import { computeStatus } from "./check-status.mts";
import { loadSeenSet, markSeen } from "../state/seen-comments.mts";
import type {
  GlobalOptions,
  ShepherdReport,
  ClassifiedCheck,
  FirstLookThread,
  FirstLookComment,
} from "../types.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CheckCommandOptions extends GlobalOptions {
  /** When true, auto-resolve outdated threads. */
  autoResolve?: boolean;
  /** When true, skip fetching job info and log tails for failing checks. */
  skipTriage?: boolean;
}

export async function runCheck(opts: CheckCommandOptions): Promise<ShepherdReport> {
  const repo = await getRepoInfo();

  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  const config = loadConfig();
  // Only paginate APPROVED reviews when the caller will actually minimize them.
  // Otherwise the first-page cap of 50 (already in the batch) is plenty — no extra round-trip.
  const paginateApprovedReviews = config.iterate.minimizeApprovals;
  const result = await fetchPrBatch(prNumber, repo, { paginateApprovedReviews });
  let batchData = result.data;

  // GraphQL sometimes returns UNKNOWN for mergeable/mergeStateStatus while the
  // REST API already has the correct value. Fall back to REST in that case.
  // Skip for non-OPEN PRs — REST also returns UNKNOWN for merged/closed PRs.
  if (
    (batchData.state ?? "OPEN") === "OPEN" &&
    (batchData.mergeable === "UNKNOWN" || batchData.mergeStateStatus === "UNKNOWN")
  ) {
    const restState = await getMergeableState(prNumber, repo.owner, repo.name);
    batchData = {
      ...batchData,
      mergeable: restState.mergeable ?? batchData.mergeable,
      mergeStateStatus: restState.mergeStateStatus ?? batchData.mergeStateStatus,
    };
  }

  // Classify checks.
  const classifiedChecks = classifyChecks(batchData.checks);
  const verdict = getCiVerdict(classifiedChecks);

  const passing = classifiedChecks.filter((c) => c.category === "passed");
  const failing = classifiedChecks.filter((c) => c.category === "failing");
  const inProgress = classifiedChecks.filter((c) => c.category === "in_progress");
  const skipped = classifiedChecks.filter((c) => c.category === "skipped");
  const filtered = classifiedChecks.filter((c) => c.category === "filtered");

  // Triage failures (fetch job info + log tails) — skipped when caller short-circuits early.
  const triaged =
    failing.length > 0 && !opts.skipTriage
      ? await triageFailingChecks(failing, repo, config.checks.logTailLines)
      : failing;

  const stateKey = { owner: repo.owner, repo: repo.name, pr: prNumber };

  // Resolve threads and comments.
  const unresolvedThreads = batchData.reviewThreads.filter((t) => !t.isResolved && !t.isMinimized);
  const visibleComments = batchData.comments.filter((c) => !c.isMinimized);

  // Auto-resolve outdated threads.
  const outdated = getOutdatedThreads(unresolvedThreads);
  let autoResolved: typeof outdated = [];
  let autoResolveErrors: string[] = [];
  if (opts.autoResolve && outdated.length > 0) {
    const { resolved: resolvedIds, errors } = await autoResolveOutdated(outdated.map((t) => t.id));
    autoResolved = outdated.filter((t) => resolvedIds.includes(t.id));
    autoResolveErrors = errors;
  }

  const activeThreads = unresolvedThreads.filter((t) => !t.isOutdated);
  // First-look: collect previously-hidden items not yet seen by the agent.
  const outdatedCandidates = batchData.reviewThreads.filter((t) => t.isOutdated);
  const resolvedCandidates = batchData.reviewThreads.filter((t) => t.isResolved && !t.isOutdated);
  const minimizedThreadCandidates = batchData.reviewThreads.filter(
    (t) => t.isMinimized && !t.isResolved && !t.isOutdated,
  );
  const minimizedCommentCandidates = batchData.comments.filter((c) => c.isMinimized);

  const seenSet = await loadSeenSet(stateKey);
  const autoResolvedIds = new Set(autoResolved.map((t) => t.id));
  const firstLookThreads: FirstLookThread[] = [
    ...outdatedCandidates
      .filter((t) => !seenSet.has(t.id))
      .map((t) => ({
        ...t,
        firstLookStatus: "outdated" as const,
        autoResolved: autoResolvedIds.has(t.id),
      })),
    ...resolvedCandidates
      .filter((t) => !seenSet.has(t.id))
      .map((t) => ({ ...t, firstLookStatus: "resolved" as const })),
    ...minimizedThreadCandidates
      .filter((t) => !seenSet.has(t.id))
      .map((t) => ({ ...t, firstLookStatus: "minimized" as const })),
  ];
  const firstLookComments: FirstLookComment[] = minimizedCommentCandidates
    .filter((c) => !seenSet.has(c.id))
    .map((c) => ({ ...c, firstLookStatus: "minimized" as const }));

  // Mark first-look items as seen (best-effort — markSeen never throws).
  await Promise.allSettled([
    ...firstLookThreads.map((t) => markSeen(stateKey, t.id)),
    ...firstLookComments.map((c) => markSeen(stateKey, c.id)),
  ]);

  // Actionable: all active threads and all visible comments (no classification — LLM handles triage).
  const actionableThreads = activeThreads;
  const actionableComments = visibleComments;

  // Derive merge status.
  const mergeStatus = deriveMergeStatus(batchData);

  // Derive blockedByFilteredCheck ghost state.
  const blockedByFilteredCheck =
    mergeStatus.status === "BLOCKED" &&
    !verdict.anyFailing &&
    !verdict.anyInProgress &&
    verdict.filteredNames.length > 0;

  // Compute overall status.
  const status = computeStatus(
    verdict,
    actionableThreads.length,
    actionableComments.length,
    mergeStatus,
    batchData.changesRequestedReviews.length,
  );

  return {
    pr: prNumber,
    nodeId: batchData.nodeId,
    repo: `${repo.owner}/${repo.name}`,
    status,
    baseBranch: batchData.baseRefName,
    mergeStatus,
    checks: {
      passing,
      failing: triaged,
      inProgress: inProgress as ClassifiedCheck[],
      skipped,
      filtered,
      filteredNames: verdict.filteredNames,
      blockedByFilteredCheck,
    },
    threads: {
      actionable: actionableThreads,
      autoResolved,
      autoResolveErrors,
      firstLook: firstLookThreads,
    },
    comments: {
      actionable: actionableComments,
      firstLook: firstLookComments,
    },
    changesRequestedReviews: batchData.changesRequestedReviews,
    reviewSummaries: batchData.reviewSummaries,
    approvedReviews: batchData.approvedReviews,
  };
}
