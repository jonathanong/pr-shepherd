import { fetchPrBatch } from "../github/batch.mts";
import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { classifyChecks, getCiVerdict } from "../checks/classify.mts";
import { mergeStartupFailureChecks } from "../checks/startup-failures.mts";
import { fetchStartupFailureChecks, triageFailingChecks } from "../checks/triage.mts";
import { deriveMergeStatus } from "../merge-status/derive.mts";
import { loadConfig } from "../config/load.mts";
import { classifyVisibleComments } from "../comments/visible-comments.mts";
import { computeStatus } from "./check-status.mts";
import { attachUnseenCheckAnnotations } from "./check-annotations.mts";
import { buildTerminalReport } from "./check-terminal-report.mts";
import {
  isBlockedByFilteredCheck,
  refreshReadyMergeability,
  refreshUnknownMergeability,
} from "./ready-mergeability.mts";
import { loadSeenMap, markSeen, classifyItem } from "../state/seen-comments.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import { classifyThreadVisibility } from "../comments/thread-visibility.mts";
import { classifyReviewsForDisplay } from "../comments/review-visibility.mts";
import { markReviewInlineThreadMarkers } from "../comments/review-thread-markers.mts";
import { normalizeBotUsernames } from "../comments/authors.mts";
import { discoverRuleFiles, loadRules } from "../classify/loader.mts";
import { buildClassifyIndex, partitionBatch } from "../classify/apply.mts";
import type {
  GlobalOptions,
  ShepherdReport,
  ClassifiedCheck,
  FirstLookComment,
} from "../types.mts";

export async function runCheck(
  opts: GlobalOptions & { autoResolve?: boolean; skipTriage?: boolean },
): Promise<ShepherdReport> {
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }
  const config = loadConfig();
  const paginateApprovedReviews = config.iterate.minimizeApprovals;
  const result = await fetchPrBatch(prNumber, repo, { paginateApprovedReviews });
  let batchData = result.data;
  const unknownRefresh = await refreshUnknownMergeability(prNumber, repo, batchData);
  batchData = unknownRefresh.batchData;
  const didRefreshMergeability = unknownRefresh.didRefresh;
  let mergeStatus = deriveMergeStatus(batchData);
  if (mergeStatus.state === "MERGED" || mergeStatus.state === "CLOSED") {
    return buildTerminalReport(prNumber, repo, batchData, mergeStatus, mergeStatus.state);
  }
  const startupFailureChecks = await fetchStartupFailureChecks(
    repo,
    batchData.headRefOid,
    prNumber,
  );
  const allChecks = mergeStartupFailureChecks(batchData.checks, startupFailureChecks);
  const classifiedChecks = classifyChecks(allChecks);
  const verdict = getCiVerdict(classifiedChecks);
  const passing = classifiedChecks.filter((c) => c.category === "passed");
  const failing = classifiedChecks.filter((c) => c.category === "failing");
  const inProgress = classifiedChecks.filter((c) => c.category === "in_progress");
  const skipped = classifiedChecks.filter((c) => c.category === "skipped");
  const filtered = classifiedChecks.filter((c) => c.category === "filtered");
  const triagedBase =
    failing.length > 0 && !opts.skipTriage ? await triageFailingChecks(failing, repo) : failing;
  const stateKey = { owner: repo.owner, repo: repo.name, pr: prNumber };
  const seenMap = await loadSeenMap(stateKey);
  const botUsernames = normalizeBotUsernames(config.botUsernames);
  const ruleSet = await loadRules(discoverRuleFiles(process.cwd()));
  const classifyIndex = buildClassifyIndex(ruleSet, batchData);
  const partition = partitionBatch(classifyIndex, batchData);
  const triaged = await attachUnseenCheckAnnotations(triagedBase, seenMap, prNumber);
  const minimizedCommentCandidates = batchData.comments.filter(
    (c) => c.isMinimized && !partition.suppressedCommentIds.has(c.id),
  );
  const visibleCommentClassification = classifyVisibleComments(
    batchData.comments.filter((c) => !partition.suppressedCommentIds.has(c.id)),
    seenMap,
    config.iterate.minimizeComments,
    botUsernames,
  );
  const threadVisibility = classifyThreadVisibility(
    batchData.reviewThreads.filter((t) => !partition.suppressedThreadIds.has(t.id)),
    seenMap,
    botUsernames,
  );
  const firstLookComments: FirstLookComment[] = minimizedCommentCandidates.flatMap((c) => {
    const cls = classifyItem(c.id, c.body, seenMap);
    if (cls === "unchanged") return [];
    const base = { ...c, firstLookStatus: "minimized" as const };
    return cls === "edited" ? [{ ...base, edited: true as const }] : [base];
  });
  const firstLookSummaries: typeof batchData.reviewSummaries = [];
  const editedSummaries: typeof batchData.reviewSummaries = [];
  const seenSummaries: typeof batchData.reviewSummaries = [];
  const unseenReviewSummaries = batchData.reviewSummaries.filter((r) => !partition.suppressedReviewSummaryIds.has(r.id));
  for (const r of unseenReviewSummaries) {
    const cls = classifyItem(r.id, r.body, seenMap);
    if (cls === "new") firstLookSummaries.push(r);
    else if (cls === "edited") editedSummaries.push(r);
    else seenSummaries.push(r);
  }
  const changesRequestedReviewVisibility = classifyReviewsForDisplay(
    batchData.changesRequestedReviews.filter((r) => !partition.suppressedChangesRequestedIds.has(r.id)),
    seenMap,
  );
  const approvedReviewVisibility = classifyReviewsForDisplay(batchData.approvedReviews, seenMap);
  await Promise.allSettled([
    ...firstLookComments.map((c) => markSeen(stateKey, c.id, c.body)),
    ...threadVisibility.toMarkSeen.map((t) => markSeen(stateKey, t.id, threadTranscriptBody(t))),
    ...visibleCommentClassification.toMarkSeen.map((c) => markSeen(stateKey, c.id, c.body)),
    ...[...firstLookSummaries, ...editedSummaries].map((r) => markSeen(stateKey, r.id, r.body)),
    ...changesRequestedReviewVisibility.toMarkSeen.map((r) => markSeen(stateKey, r.id, r.body)),
    ...approvedReviewVisibility.toMarkSeen.map((r) => markSeen(stateKey, r.id, r.body)),
    ...batchData.comments.filter((c) => partition.suppressedCommentIds.has(c.id)).map((c) => markSeen(stateKey, c.id, c.body)),
    ...batchData.reviewThreads.filter((t) => partition.suppressedThreadIds.has(t.id)).map((t) => markSeen(stateKey, t.id, threadTranscriptBody(t))),
    ...batchData.reviewSummaries.filter((r) => partition.suppressedReviewSummaryIds.has(r.id)).map((r) => markSeen(stateKey, r.id, r.body)),
    ...batchData.changesRequestedReviews.filter((r) => partition.suppressedChangesRequestedIds.has(r.id)).map((r) => markSeen(stateKey, r.id, r.body)),
  ]);
  await markReviewInlineThreadMarkers(stateKey, batchData.reviewThreads);
  const changesRequestedReviews = changesRequestedReviewVisibility.visible;
  const changesRequestedReviewCount = batchData.changesRequestedReviews.length;
  const approvedReviews = approvedReviewVisibility.visible;
  let status = computeStatus(
    verdict,
    threadVisibility.activeThreads.length + threadVisibility.resolutionOnlyThreads.length,
    visibleCommentClassification.actionable.length,
    mergeStatus,
    changesRequestedReviewCount,
  );

  if (status === "READY" && !didRefreshMergeability) {
    const refreshed = await refreshReadyMergeability(
      prNumber,
      repo,
      batchData,
      verdict,
      threadVisibility.activeThreads.length + threadVisibility.resolutionOnlyThreads.length,
      visibleCommentClassification.actionable.length,
    );
    batchData = refreshed.batchData;
    mergeStatus = refreshed.mergeStatus;
    status = refreshed.status;
  }
  const blockedByFilteredCheck = isBlockedByFilteredCheck(mergeStatus, verdict);
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
      actionable: threadVisibility.activeThreads,
      resolutionOnly: threadVisibility.resolutionOnlyThreads,
      autoResolved: [],
      autoResolveErrors: [],
      firstLook: threadVisibility.firstLookThreads,
      ...(partition.ruleAutoResolveThreadIds.length > 0 ? { ruleAutoResolveIds: partition.ruleAutoResolveThreadIds } : undefined),
    },
    comments: {
      actionable: visibleCommentClassification.actionable,
      minimizeIds: [...visibleCommentClassification.minimizeIds, ...partition.ruleAutoResolveCommentIds],
      firstLook: firstLookComments,
    },
    changesRequestedReviews,
    reviewSummaries: seenSummaries,
    firstLookSummaries,
    editedSummaries,
    approvedReviews,
    ...(partition.ruleAutoResolveReviewSummaryIds.length > 0 ? { ruleAutoResolveReviewSummaryIds: partition.ruleAutoResolveReviewSummaryIds } : undefined),
    branchProtection: batchData.branchProtection,
    activity: batchData.activity,
  };
}
