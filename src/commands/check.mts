import { fetchPrBatch } from "../github/batch.mts";
import { getRepoInfo, getCurrentPrNumber, getMergeableState } from "../github/client.mts";
import { classifyChecks, getCiVerdict } from "../checks/classify.mts";
import { triageFailingChecks } from "../checks/triage.mts";
import { getOutdatedThreads } from "../comments/outdated.mts";
import { autoResolveOutdated } from "../comments/resolve.mts";
import { deriveMergeStatus } from "../merge-status/derive.mts";
import { loadConfig } from "../config/load.mts";
import { computeStatus } from "./check-status.mts";
import { loadSeenMap, markSeen, classifyItem } from "../state/seen-comments.mts";
import type {
  GlobalOptions,
  ShepherdReport,
  ClassifiedCheck,
  FirstLookThread,
  FirstLookComment,
} from "../types.mts";

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
  const paginateApprovedReviews = config.iterate.minimizeApprovals;
  const result = await fetchPrBatch(prNumber, repo, { paginateApprovedReviews });
  let batchData = result.data;

  // Fall back to REST when GraphQL returns UNKNOWN — skip for non-OPEN PRs.
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

  const classifiedChecks = classifyChecks(batchData.checks);
  const verdict = getCiVerdict(classifiedChecks);

  const passing = classifiedChecks.filter((c) => c.category === "passed");
  const failing = classifiedChecks.filter((c) => c.category === "failing");
  const inProgress = classifiedChecks.filter((c) => c.category === "in_progress");
  const skipped = classifiedChecks.filter((c) => c.category === "skipped");
  const filtered = classifiedChecks.filter((c) => c.category === "filtered");

  const triaged =
    failing.length > 0 && !opts.skipTriage ? await triageFailingChecks(failing, repo) : failing;

  const stateKey = { owner: repo.owner, repo: repo.name, pr: prNumber };

  const unresolvedThreads = batchData.reviewThreads.filter((t) => !t.isResolved);
  const visibleComments = batchData.comments.filter((c) => !c.isMinimized);

  const outdated = getOutdatedThreads(unresolvedThreads);
  let autoResolved: typeof outdated = [];
  let autoResolveErrors: string[] = [];
  if (opts.autoResolve && outdated.length > 0) {
    const { resolved: resolvedIds, errors } = await autoResolveOutdated(outdated.map((t) => t.id));
    autoResolved = outdated.filter((t) => resolvedIds.includes(t.id));
    autoResolveErrors = errors;
  }

  const activeThreads = unresolvedThreads.filter((t) => !t.isOutdated && !t.isMinimized);
  const outdatedCandidates = batchData.reviewThreads.filter((t) => t.isOutdated);
  const resolvedCandidates = batchData.reviewThreads.filter((t) => t.isResolved && !t.isOutdated);
  const minimizedThreadCandidates = batchData.reviewThreads.filter(
    (t) => t.isMinimized && !t.isResolved && !t.isOutdated,
  );
  const minimizedCommentCandidates = batchData.comments.filter((c) => c.isMinimized);

  const seenMap = await loadSeenMap(stateKey);
  const autoResolvedIds = new Set(autoResolved.map((t) => t.id));
  const firstLookThreads: FirstLookThread[] = [
    ...outdatedCandidates.flatMap((t) => {
      const cls = classifyItem(t.id, t.body, seenMap);
      if (cls === "unchanged") return [];
      const base = {
        ...t,
        firstLookStatus: "outdated" as const,
        autoResolved: autoResolvedIds.has(t.id),
      };
      return cls === "edited" ? [{ ...base, edited: true as const }] : [base];
    }),
    ...resolvedCandidates.flatMap((t) => {
      const cls = classifyItem(t.id, t.body, seenMap);
      if (cls === "unchanged") return [];
      const base = { ...t, firstLookStatus: "resolved" as const };
      return cls === "edited" ? [{ ...base, edited: true as const }] : [base];
    }),
    ...minimizedThreadCandidates.flatMap((t) => {
      const cls = classifyItem(t.id, t.body, seenMap);
      if (cls === "unchanged") return [];
      const base = { ...t, firstLookStatus: "minimized" as const };
      return cls === "edited" ? [{ ...base, edited: true as const }] : [base];
    }),
  ];
  const firstLookComments: FirstLookComment[] = minimizedCommentCandidates.flatMap((c) => {
    const cls = classifyItem(c.id, c.body, seenMap);
    if (cls === "unchanged") return [];
    const base = { ...c, firstLookStatus: "minimized" as const };
    return cls === "edited" ? [{ ...base, edited: true as const }] : [base];
  });

  const firstLookSummaries: typeof batchData.reviewSummaries = [];
  const editedSummaries: typeof batchData.reviewSummaries = [];
  const seenSummaries: typeof batchData.reviewSummaries = [];
  for (const r of batchData.reviewSummaries) {
    const cls = classifyItem(r.id, r.body, seenMap);
    if (cls === "new") firstLookSummaries.push(r);
    else if (cls === "edited") editedSummaries.push(r);
    else seenSummaries.push(r);
  }

  await Promise.allSettled([
    ...firstLookThreads.map((t) => markSeen(stateKey, t.id, t.body)),
    ...firstLookComments.map((c) => markSeen(stateKey, c.id, c.body)),
    ...[...firstLookSummaries, ...editedSummaries].map((r) => markSeen(stateKey, r.id, r.body)),
  ]);

  const actionableThreads = activeThreads;
  const resolutionOnlyThreads = unresolvedThreads.filter(
    (t) => !autoResolvedIds.has(t.id) && (t.isOutdated || t.isMinimized),
  );
  const actionableComments = visibleComments;

  const mergeStatus = deriveMergeStatus(batchData);

  const blockedByFilteredCheck =
    mergeStatus.status === "BLOCKED" &&
    !verdict.anyFailing &&
    !verdict.anyInProgress &&
    verdict.filteredNames.length > 0;

  const status = computeStatus(
    verdict,
    actionableThreads.length + resolutionOnlyThreads.length,
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
      resolutionOnly: resolutionOnlyThreads,
      autoResolved,
      autoResolveErrors,
      firstLook: firstLookThreads,
    },
    comments: {
      actionable: actionableComments,
      firstLook: firstLookComments,
    },
    changesRequestedReviews: batchData.changesRequestedReviews,
    reviewSummaries: seenSummaries,
    firstLookSummaries,
    editedSummaries,
    approvedReviews: batchData.approvedReviews,
  };
}
