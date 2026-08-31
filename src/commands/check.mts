import { fetchPrBatch } from "../github/batch.mts";
import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { classifyChecks, getCiVerdict } from "../checks/classify.mts";
import { mergeStartupFailureChecks } from "../checks/startup-failures.mts";
import { fetchStartupFailureChecks, triageFailingChecks } from "../checks/triage.mts";
import { deriveMergeStatus } from "../merge-status/derive.mts";
import { loadConfig } from "../config/load.mts";
import { classifyVisibleComments } from "../comments/visible-comments.mts";
import { computeStatus } from "./check-status.mts";
import { annotationMarkerBody, attachAndMergeCheckAnnotations } from "./check-annotations.mts";
import { buildTerminalReport } from "./check-terminal-report.mts";
import {
  isBlockedByFilteredCheck,
  refreshReadyMergeability,
  refreshUnknownMergeability,
} from "./ready-mergeability.mts";
import { loadSeenMap, markSeen, classifyItem } from "../state/seen-comments.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import { classifyThreadVisibility } from "../comments/thread-visibility.mts";
import {
  classifyReviewsForDisplay,
  classifyChangesRequestedReviewsForDisplay,
} from "../comments/review-visibility.mts";
import { autoMinimizeComments, autoResolveThreads } from "../comments/resolve.mts";
import { markReviewInlineThreadMarkers } from "../comments/review-thread-markers.mts";
import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  normalizeBotUsernames,
} from "../comments/authors.mts";
import { buildThreadMutationRouting } from "./iterate/thread-mutation-routing.mts";
import { discoverRuleFiles, loadRules } from "../classify/loader.mts";
import { buildClassifyIndex, partitionBatch, type BatchPartition } from "../classify/apply.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { getEffectiveCwd } from "../execution-context.mts";
import type {
  GlobalOptions,
  ShepherdReport,
  ClassifiedCheck,
  FirstLookComment,
} from "../types.mts";

export async function runCheck(
  opts: GlobalOptions & {
    autoResolve?: boolean;
    autoMinimizeSuppressed?: boolean;
    skipTriage?: boolean;
    persistSeen?: boolean;
  },
): Promise<ShepherdReport> {
  const repo = opts.targetRepository ?? (await getRepoInfo());
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new ShepherdError(
      "No open PR found for current branch. Pass a PR number explicitly.",
      EXIT.UNAVAILABLE,
    );
  }
  const stateKey = { owner: repo.owner, repo: repo.name, pr: prNumber };
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
  const startupFailureChecks = result.checkSuitesComplete
    ? []
    : await fetchStartupFailureChecks(repo, batchData.headRefOid, prNumber, stateKey);
  const allChecks = mergeStartupFailureChecks(batchData.checks, startupFailureChecks);
  const classifiedPrChecks = classifyChecks(allChecks);
  const latestRemoval = batchData.latestMergeQueueRemoval;
  const headUpdatedAfterRemoval = Boolean(
    latestRemoval &&
    latestRemoval.beforeCommitParentOids &&
    !latestRemoval.beforeCommitParentOids.includes(batchData.headRefOid),
  );
  const queueRawChecks = batchData.isInMergeQueue
    ? (batchData.mergeQueueChecks ?? [])
    : latestRemoval && !headUpdatedAfterRemoval
      ? (batchData.removedMergeQueueChecks ?? [])
      : [];
  // Keep supersession grouping commit-local, but accept merge_group only for the
  // synthetic queue-commit source.
  const classifiedQueueChecks = classifyChecks(queueRawChecks, {
    additionalRelevantEvents: ["merge_group"],
  });
  const classifiedChecks = [...classifiedPrChecks, ...classifiedQueueChecks];
  const verdict = getCiVerdict(classifiedChecks);
  const passing = classifiedChecks.filter((c) => c.category === "passed");
  const failing = classifiedChecks.filter((c) => c.category === "failing");
  const inProgress = classifiedChecks.filter((c) => c.category === "in_progress");
  const skipped = classifiedChecks.filter((c) => c.category === "skipped");
  const filtered = classifiedChecks.filter((c) => c.category === "filtered");
  const ignored = classifiedChecks.filter((c) => c.category === "ignored");
  const triagedBase =
    failing.length > 0 && !opts.skipTriage
      ? await triageFailingChecks(failing, repo, stateKey)
      : failing;
  const seenMap = await loadSeenMap(stateKey);
  const botUsernames = normalizeBotUsernames(config.botUsernames);
  const ruleSet = await loadRules(discoverRuleFiles(getEffectiveCwd()));
  const classifyIndex = buildClassifyIndex(ruleSet, batchData);
  const partition = partitionBatch(classifyIndex, batchData);
  const merged = await attachAndMergeCheckAnnotations(
    { passing, failing: triagedBase, skipped, filtered, ignored },
    seenMap,
    prNumber,
    { stateKey, headSha: batchData.headRefOid },
  );
  const ignoredAnnotated = merged.ignored.filter((c) => (c.annotations?.length ?? 0) > 0);
  const minimizedCommentCandidates = batchData.comments.filter(
    (c) => c.isMinimized && !partition.suppressedCommentIds.has(c.id),
  );
  const deniedRuleAutoResolveCommentIds = new Set(
    partition.ruleAutoResolveCommentIds.filter(
      (id) => batchData.comments.find((comment) => comment.id === id)?.viewerCanMinimize !== true,
    ),
  );
  const visibleCommentClassification = classifyVisibleComments(
    batchData.comments.filter(
      (c) => !partition.suppressedCommentIds.has(c.id) || deniedRuleAutoResolveCommentIds.has(c.id),
    ),
    seenMap,
    config.iterate.minimizeComments,
    botUsernames,
  );
  const deniedRuleAutoResolveThreadIds = new Set(
    partition.ruleAutoResolveThreadIds.filter(
      (id) => batchData.reviewThreads.find((thread) => thread.id === id)?.viewerCanResolve !== true,
    ),
  );
  const visibleThreadCandidates = batchData.reviewThreads.filter(
    (t) => !partition.suppressedThreadIds.has(t.id) || deniedRuleAutoResolveThreadIds.has(t.id),
  );
  const threadMutationRouting = buildThreadMutationRouting(
    visibleThreadCandidates,
    botUsernames,
    partition.ruleAutoResolveThreadIds,
  );
  const replyThreadIds = new Set(threadMutationRouting.replyThreadIds);
  const resolveThreadIds = new Set(threadMutationRouting.resolveThreadIds);
  const repeatableThreadIds = new Set(
    visibleThreadCandidates
      .filter(
        (thread) =>
          thread.path !== null &&
          thread.line !== null &&
          (!replyThreadIds.has(thread.id) || thread.viewerCanReply === true) &&
          (!resolveThreadIds.has(thread.id) || thread.viewerCanResolve === true),
      )
      .map((thread) => thread.id),
  );
  const threadVisibility = classifyThreadVisibility(
    visibleThreadCandidates,
    seenMap,
    botUsernames,
    repeatableThreadIds,
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
  const deniedRuleAutoResolveReviewSummaryIds = new Set(
    partition.ruleAutoResolveReviewSummaryIds.filter(
      (id) =>
        batchData.reviewSummaries.find((review) => review.id === id)?.viewerCanMinimize !== true,
    ),
  );
  const unseenReviewSummaries = batchData.reviewSummaries.filter(
    (r) =>
      !partition.suppressedReviewSummaryIds.has(r.id) ||
      deniedRuleAutoResolveReviewSummaryIds.has(r.id),
  );
  for (const r of unseenReviewSummaries) {
    const cls = classifyItem(r.id, r.body, seenMap);
    if (cls === "new") firstLookSummaries.push(r);
    else if (cls === "edited") editedSummaries.push(r);
    else seenSummaries.push(r);
  }
  const changesRequestedReviewVisibility = classifyChangesRequestedReviewsForDisplay(
    batchData.changesRequestedReviews.filter(
      (r) => !partition.suppressedChangesRequestedIds.has(r.id),
    ),
    seenMap,
    botUsernames,
    batchData.viewerAuthorization?.viewerCanAdminister === true,
  );
  const approvedReviewVisibility = classifyReviewsForDisplay(batchData.approvedReviews, seenMap);
  if (opts.persistSeen !== false) {
    const successfulAnnotations = [
      ...merged.passing,
      ...merged.skipped,
      ...merged.filtered,
      ...merged.ignored,
    ]
      .filter((check) => check.conclusion === "SUCCESS")
      .flatMap((check) => check.annotations ?? []);
    await Promise.allSettled([
      ...successfulAnnotations.map((a) => markSeen(stateKey, a.id, annotationMarkerBody(a))),
      ...firstLookComments.map((c) => markSeen(stateKey, c.id, c.body)),
      ...threadVisibility.toMarkSeen.map((t) => markSeen(stateKey, t.id, threadTranscriptBody(t))),
      ...visibleCommentClassification.toMarkSeen.map((c) => markSeen(stateKey, c.id, c.body)),
      ...[...firstLookSummaries, ...editedSummaries].map((r) => markSeen(stateKey, r.id, r.body)),
      ...changesRequestedReviewVisibility.toMarkSeen.map((r) => markSeen(stateKey, r.id, r.body)),
      ...approvedReviewVisibility.toMarkSeen.map((r) => markSeen(stateKey, r.id, r.body)),
      ...batchData.comments
        .filter((c) => partition.suppressedCommentIds.has(c.id))
        .map((c) => markSeen(stateKey, c.id, c.body)),
      ...batchData.reviewThreads
        .filter((t) => partition.suppressedThreadIds.has(t.id))
        .map((t) => markSeen(stateKey, t.id, threadTranscriptBody(t))),
      ...batchData.reviewSummaries
        .filter(
          (r) =>
            partition.suppressedReviewSummaryIds.has(r.id) &&
            !deniedRuleAutoResolveReviewSummaryIds.has(r.id),
        )
        .map((r) => markSeen(stateKey, r.id, r.body)),
      ...batchData.changesRequestedReviews
        .filter((r) => partition.suppressedChangesRequestedIds.has(r.id))
        .map((r) => markSeen(stateKey, r.id, r.body)),
    ]);
    await markReviewInlineThreadMarkers(stateKey, batchData.reviewThreads);
  }
  const authorizedPartition: BatchPartition = {
    ...partition,
    ruleAutoResolveThreadIds: partition.ruleAutoResolveThreadIds.filter(
      (id) => batchData.reviewThreads.find((thread) => thread.id === id)?.viewerCanResolve === true,
    ),
    ruleAutoResolveCommentIds: partition.ruleAutoResolveCommentIds.filter(
      (id) => batchData.comments.find((comment) => comment.id === id)?.viewerCanMinimize === true,
    ),
    ruleAutoResolveReviewSummaryIds: partition.ruleAutoResolveReviewSummaryIds.filter(
      (id) =>
        batchData.reviewSummaries.find((review) => review.id === id)?.viewerCanMinimize === true,
    ),
  };
  const {
    threadIds: authorizedRuleAutoResolveThreadIds,
    commentIds: ruleAutoResolveCommentIds,
    reviewSummaryIds: ruleAutoResolveReviewSummaryIds,
  } = await remainingRuleAutoResolveIds(authorizedPartition, opts.autoMinimizeSuppressed);
  const visibleMutationThreadIds = new Set(
    [...threadVisibility.activeThreads, ...threadVisibility.resolutionOnlyThreads].map(
      (thread) => thread.id,
    ),
  );
  const ruleAutoResolveThreadIds = [
    ...authorizedRuleAutoResolveThreadIds,
    ...[...deniedRuleAutoResolveThreadIds].filter((id) => visibleMutationThreadIds.has(id)),
  ];
  const changesRequestedReviews = changesRequestedReviewVisibility.visible;
  const visibleChangesRequestedIds = new Set(changesRequestedReviews.map((review) => review.id));
  const changesRequestedReviewCount = batchData.changesRequestedReviews.filter((review) => {
    if (partition.suppressedChangesRequestedIds.has(review.id)) return false;
    const isBot = !isHumanAuthor(review) || isConfiguredBotAuthor(review, botUsernames);
    return (
      !isBot ||
      batchData.viewerAuthorization?.viewerCanAdminister === true ||
      visibleChangesRequestedIds.has(review.id)
    );
  }).length;
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
      changesRequestedReviewCount,
    );
    batchData = refreshed.batchData;
    mergeStatus = refreshed.mergeStatus;
    status = refreshed.status;
    if (mergeStatus.state === "MERGED" || mergeStatus.state === "CLOSED") {
      return buildTerminalReport(prNumber, repo, batchData, mergeStatus, mergeStatus.state);
    }
  }
  const blockedByFilteredCheck = isBlockedByFilteredCheck(mergeStatus, verdict);
  const queueCommit = batchData.isInMergeQueue
    ? batchData.mergeQueueEntry?.headCommitOid
    : batchData.latestMergeQueueRemoval?.beforeCommitOid;
  const hasQueueState = Boolean(
    batchData.isMergeQueueEnabled ||
    batchData.isInMergeQueue ||
    batchData.autoMergeRequest ||
    batchData.latestMergeQueueRemoval,
  );
  return {
    pr: prNumber,
    nodeId: batchData.nodeId,
    headSha: batchData.headRefOid,
    repo: `${repo.owner}/${repo.name}`,
    ...(batchData.viewerAuthorization && { viewerAuthorization: batchData.viewerAuthorization }),
    status,
    baseBranch: batchData.baseRefName,
    mergeStatus,
    checks: {
      passing: merged.passing,
      failing: merged.failing,
      inProgress: inProgress as ClassifiedCheck[],
      skipped: merged.skipped,
      filtered: merged.filtered,
      ...(ignoredAnnotated.length > 0 && { ignored: ignoredAnnotated }),
      filteredNames: verdict.filteredNames,
      blockedByFilteredCheck,
      ...(verdict.ignoredNames.length > 0 && { ignoredNames: verdict.ignoredNames }),
      ...(verdict.supersededNames.length > 0 && { supersededNames: verdict.supersededNames }),
    },
    threads: {
      actionable: threadVisibility.activeThreads,
      resolutionOnly: threadVisibility.resolutionOnlyThreads,
      autoResolved: [],
      autoResolveErrors: [],
      firstLook: threadVisibility.firstLookThreads,
      ...(ruleAutoResolveThreadIds.length > 0
        ? { ruleAutoResolveIds: ruleAutoResolveThreadIds }
        : undefined),
    },
    comments: {
      actionable: visibleCommentClassification.actionable,
      minimizeIds: [...visibleCommentClassification.minimizeIds, ...ruleAutoResolveCommentIds],
      firstLook: firstLookComments,
    },
    changesRequestedReviews,
    reviewSummaries: seenSummaries,
    firstLookSummaries,
    editedSummaries,
    approvedReviews,
    ...(ruleAutoResolveReviewSummaryIds.length > 0
      ? { ruleAutoResolveReviewSummaryIds }
      : undefined),
    branchProtection: batchData.branchProtection,
    activity: batchData.activity,
    ...(hasQueueState && {
      mergeQueue: {
        enabled: Boolean(batchData.isMergeQueueEnabled),
        inQueue: Boolean(batchData.isInMergeQueue),
        ...(batchData.autoMergeRequest && { autoMergeRequest: batchData.autoMergeRequest }),
        ...(batchData.mergeQueueEntry && { entry: batchData.mergeQueueEntry }),
        ...(batchData.latestMergeQueueRemoval && {
          latestRemoval: batchData.latestMergeQueueRemoval,
        }),
        ...(queueCommit && { checkCommitOid: queueCommit }),
        ...((batchData.isInMergeQueue
          ? batchData.mergeQueueChecksIncomplete
          : batchData.removedMergeQueueChecksIncomplete) && {
          checksIncomplete: true as const,
        }),
        ...(headUpdatedAfterRemoval && { headUpdatedAfterRemoval: true as const }),
      },
    }),
  };
}

interface RuleAutoResolveIds {
  threadIds: string[];
  commentIds: string[];
  reviewSummaryIds: string[];
}

async function remainingRuleAutoResolveIds(
  partition: BatchPartition,
  autoMinimizeSuppressed = false,
): Promise<RuleAutoResolveIds> {
  const consumedIds = autoMinimizeSuppressed
    ? await selfApplySuppressedRuleAutoResolve(partition)
    : { minimized: new Set<string>(), resolvedThreads: new Set<string>() };
  return {
    threadIds: partition.ruleAutoResolveThreadIds.filter(
      (id) => !consumedIds.resolvedThreads.has(id),
    ),
    commentIds: partition.ruleAutoResolveCommentIds.filter((id) => !consumedIds.minimized.has(id)),
    reviewSummaryIds: partition.ruleAutoResolveReviewSummaryIds.filter(
      (id) => !consumedIds.minimized.has(id),
    ),
  };
}

async function selfApplySuppressedRuleAutoResolve(
  partition: BatchPartition,
): Promise<{ minimized: Set<string>; resolvedThreads: Set<string> }> {
  const minimizeIds = [
    ...partition.ruleAutoResolveCommentIds.filter((id) => partition.suppressedCommentIds.has(id)),
    ...partition.ruleAutoResolveReviewSummaryIds.filter((id) =>
      partition.suppressedReviewSummaryIds.has(id),
    ),
  ];
  const threadIds = partition.ruleAutoResolveThreadIds.filter((id) =>
    partition.suppressedThreadIds.has(id),
  );
  const [minimized, resolved] = await Promise.all([
    minimizeIds.length > 0
      ? autoMinimizeComments(minimizeIds)
      : Promise.resolve({ minimized: [], errors: [] }),
    threadIds.length > 0
      ? autoResolveThreads(threadIds)
      : Promise.resolve({ resolved: [], errors: [] }),
  ]);
  return {
    minimized: new Set(minimized.minimized),
    resolvedThreads: new Set(resolved.resolved),
  };
}
