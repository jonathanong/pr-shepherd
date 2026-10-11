import { fetchPrBatch } from "../github/batch.mts";
import { headArrivalUnix, queueRemovalAppliesToHead } from "../github/queue-removal-freshness.mts";
import {
  readQueueRemovalAcknowledgment,
  matchesQueueRemovalAcknowledgment,
  isCiQueueRemovalReason,
} from "../state/queue-removal-ack.mts";
import { storePrFingerprint } from "../state/pr-fingerprint.mts";
import { storeRestSnapshotReport } from "../state/rest-snapshot-report.mts";
import { restSnapshotState, withRestConditionalScope } from "../github/rest-conditional-scope.mts";
import { fingerprintReuser, tryReuseRestSnapshotReport } from "./check-fingerprint.mts";
import { collectUnreportedRequired, refreshCachedUnreported } from "./check-unreported.mts";
import { getRepoInfo, getCurrentPrNumber, type RepoInfo } from "../github/client.mts";
import { classifyChecks, getCiVerdict } from "../checks/classify.mts";
import { mergeStartupFailureChecks } from "../checks/startup-failures.mts";
import { fetchStartupFailureChecks, triageFailingChecks } from "../checks/triage.mts";
import { TriageBudget } from "../checks/triage-budget.mts";
import type { CheckExecutionContext } from "./check-execution-context.mts";
import { deriveMergeStatus } from "../merge-status/derive.mts";
import { loadConfig } from "../config/load.mts";
import { classifyVisibleComments } from "../comments/visible-comments.mts";
import { computeStatus } from "./check-status.mts";
import {
  annotationMarkerBody,
  attachAndMergeCheckAnnotations,
  hasCheckDrivenActionableWork,
} from "./check-annotations.mts";
import { buildTerminalReport } from "./check-terminal-report.mts";
import {
  isBlockedByFilteredCheck,
  refreshReadyMergeability,
  refreshUnknownMergeability,
} from "./ready-mergeability.mts";
import { loadSeenMap, markSeen, classifyItem, mutationWasDenied } from "../state/seen-comments.mts";
import { aliasThreadSeenMarkers } from "../github/rest-identities.mts";
import { canGenerateGithubMutation } from "../github/mutation-policy.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import { classifyThreadVisibility } from "../comments/thread-visibility.mts";
import {
  classifyReviewsForDisplay,
  classifyChangesRequestedReviewsForDisplay,
} from "../comments/review-visibility.mts";
import { applySuppressedRuleAutoResolve } from "./rule-auto-resolve.mts";
import { markReviewInlineThreadMarkers } from "../comments/review-thread-markers.mts";
import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  normalizeBotUsernames,
} from "../comments/authors.mts";
import {
  buildThreadMutationRouting,
  threadHasAuthorizedMutation,
} from "./iterate/thread-mutation-routing.mts";
import { discoverRuleFiles, loadRules } from "../classify/loader.mts";
import { buildClassifyIndex, partitionBatch, type BatchPartition } from "../classify/apply.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { getEffectiveCwd } from "../execution-context.mts";
import type {
  GlobalOptions,
  ShepherdReport,
  ClassifiedCheck,
  FirstLookComment,
  BatchPrData,
  ShepherdStatus,
} from "../types.mts";

function enforceTransportReadiness(status: ShepherdStatus, data: BatchPrData): ShepherdStatus {
  if (status !== "READY" || data.transport !== "rest") return status;
  const unavailable = data.transportUnavailable ?? [];
  if (
    data.reviewThreads.some(
      (thread) =>
        thread.isResolved === undefined ||
        thread.isOutdated === undefined ||
        thread.comments === undefined,
    )
  )
    return "UNKNOWN";
  if (
    unavailable.some(({ field }) =>
      /^(reviewThreads(?:\.|$)|reviewTranscripts(?:\.|$)|changesRequestedReviews(?:\.|$)|reviewSummaries(?:\.|$)|checks(?:\.|$)|checkRuns(?:\.|$)|checkSuites(?:\.|$)|checkAnnotations(?:\.|$)|annotations(?:\.|$)|nativeStack(?:\.|$))/.test(
        field,
      ),
    )
  )
    return "UNKNOWN";
  const missingPolicy = unavailable.some(({ field }) =>
    /^(reviewDecision|branchProtection|branchRules|mergeRequirements)(?:\.|$)/.test(field),
  );
  if (missingPolicy && data.mergeStateStatus !== "CLEAN") return "UNKNOWN";
  return status;
}

type CheckOptions = GlobalOptions & {
  autoResolve?: boolean;
  autoMinimizeSuppressed?: boolean;
  skipTriage?: boolean;
  persistSeen?: boolean;
  fingerprintCache?: boolean;
  merge?: boolean;
};

export async function runCheck(
  opts: CheckOptions,
  context?: CheckExecutionContext,
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
  // Named REST reads in this PR's check are conditional (ETag/304) and cached under its state dir.
  return withRestConditionalScope(stateKey, () =>
    runScopedCheck(opts, context, repo, prNumber, stateKey),
  );
}

async function runScopedCheck(
  opts: CheckOptions,
  context: CheckExecutionContext | undefined,
  repo: RepoInfo,
  prNumber: number,
  stateKey: { owner: string; repo: string; pr: number },
): Promise<ShepherdReport> {
  const config = loadConfig();
  const reuseFingerprint = opts.fingerprintCache === true;
  const reuse = reuseFingerprint
    ? await fingerprintReuser(prNumber, repo, stateKey, config)
    : undefined;
  const paginateApprovedReviews = config.iterate.minimizeApprovals;
  const includeReceiptSummary = (await context?.wantsReceiptSummary(prNumber, repo)) ?? false;
  const batchOptions = {
    paginateApprovedReviews,
    ...(includeReceiptSummary && { includeReceiptSummary: true }),
  };
  const fetched = reuse
    ? await fetchPrBatch(prNumber, repo, batchOptions, reuse)
    : await fetchPrBatch(prNumber, repo, batchOptions);
  if (fetched.stackEvidence) context?.seedStack(prNumber, repo, fetched.stackEvidence);
  if ("reused" in fetched)
    return refreshCachedUnreported(fetched.reused, repo, context, fetched.baseTipOid);
  const result = fetched;
  context?.setReceiptSummary(result.receiptSummary ?? null);
  const restSnapshot = result.data.transport === "rest" ? restSnapshotState() : undefined;
  if (reuseFingerprint) {
    const reused = await tryReuseRestSnapshotReport(stateKey, config, restSnapshot);
    if (reused) return refreshCachedUnreported(reused, repo, context);
  }
  let batchData = result.data;
  const unknownRefresh = await refreshUnknownMergeability(prNumber, repo, batchData);
  batchData = unknownRefresh.batchData;
  const didRefreshMergeability = unknownRefresh.didRefresh;
  let mergeStatus = deriveMergeStatus(batchData);
  if (mergeStatus.state === "MERGED" || mergeStatus.state === "CLOSED") {
    const terminal = buildTerminalReport(prNumber, repo, batchData, mergeStatus, mergeStatus.state);
    if (result.fingerprint) {
      await storePrFingerprint(stateKey, result.fingerprint, terminal, config);
    }
    return terminal;
  }
  const startupFailuresNeedAttempt = batchData.checks.some(
    (check) => check.source === "startup_failure" && check.runAttempt === undefined,
  );
  const triageBudget = new TriageBudget();
  const startupFailureChecks =
    result.checkSuitesComplete && !startupFailuresNeedAttempt
      ? []
      : await fetchStartupFailureChecks(
          repo,
          batchData.headRefOid,
          prNumber,
          stateKey,
          triageBudget,
        );
  const allChecks = mergeStartupFailureChecks(batchData.checks, startupFailureChecks);
  const classifiedPrChecks = classifyChecks(allChecks);
  const latestRemoval = batchData.latestMergeQueueRemoval;
  // `timelineItems(last: 1, ...)` returns the single most recent removal regardless of age, so
  // a PR removed from the queue once, long ago, and never re-added keeps returning that same
  // historical event forever. When GitHub omits the removed queue commit for that old event
  // (e.g. after the synthetic commit is garbage collected), freshness is unverifiable — treat
  // it as stale/updated rather than as still current, so Shepherd doesn't escalate
  // `merge-queue-removed` permanently on data it can no longer check. A squash or rebase
  // queue commit has one parent and does not list the PR head; that removal stays current
  // until this head reached the PR after it (`headArrivalUnix`). The raw removal fields
  // still render in the merge-queue header regardless of this flag.
  const headTimes = {
    headCommittedAtUnix: batchData.activity?.latestCommitCommittedAtUnix,
    headPushedAtUnix: batchData.headPushedAtUnix,
    headForcePushedAtUnix: batchData.headForcePushedAtUnix,
  };
  const headUpdatedAfterRemoval = Boolean(
    latestRemoval &&
    !queueRemovalAppliesToHead({
      ...headTimes,
      parentOids: latestRemoval.beforeCommitParentOids,
      headOid: batchData.headRefOid,
      removedAtUnix: latestRemoval.createdAtUnix,
    }),
  );
  // Repeat ejections of this head: removals after it reached the PR.
  const headSinceUnix = headArrivalUnix(headTimes);
  const removalsOnHead =
    latestRemoval && !headUpdatedAfterRemoval && headSinceUnix !== undefined
      ? (batchData.mergeQueueRemovalTimesUnix ?? []).filter((t) => t >= headSinceUnix).length
      : 0;
  const removalAcknowledged = Boolean(
    batchData.stack &&
    latestRemoval?.beforeCommitOid &&
    isCiQueueRemovalReason(latestRemoval.reason) &&
    !batchData.isInMergeQueue &&
    !headUpdatedAfterRemoval &&
    matchesQueueRemovalAcknowledgment(await readQueueRemovalAcknowledgment(stateKey), {
      headSha: batchData.headRefOid,
      queueCommitOid: latestRemoval.beforeCommitOid,
      removedAtUnix: latestRemoval.createdAtUnix,
    }),
  );
  const queueRawChecks = batchData.isInMergeQueue
    ? (batchData.mergeQueueChecks ?? [])
    : latestRemoval && !headUpdatedAfterRemoval && !removalAcknowledged
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
      ? await triageFailingChecks(
          failing,
          repo,
          stateKey,
          triageBudget,
          classifiedChecks.filter((c) => c.category !== "failing"),
        )
      : failing;
  triageBudget.throwIfSecondary();
  triageBudget.reportOmissionIfNeeded();
  const seenMap = await loadSeenMap(stateKey);
  await aliasThreadSeenMarkers(
    repo,
    prNumber,
    batchData.reviewThreads.map((thread) => thread.id),
    seenMap,
  );
  const canGenerateItemMutation = (
    id: string,
    body: string,
    capability: boolean | undefined,
    operation: "reply" | "resolve" | "dismiss" | "minimize" | "view",
  ): boolean =>
    !mutationWasDenied(id, body, seenMap) && canGenerateGithubMutation(capability, operation);
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
      (id) =>
        !canGenerateItemMutation(
          id,
          batchData.comments.find((comment) => comment.id === id)?.body ?? "",
          batchData.comments.find((comment) => comment.id === id)?.viewerCanMinimize,
          "minimize",
        ),
    ),
  );
  const visibleCommentClassification = classifyVisibleComments(
    batchData.comments.filter(
      (c) => !partition.suppressedCommentIds.has(c.id) || deniedRuleAutoResolveCommentIds.has(c.id),
    ),
    seenMap,
    config.iterate.minimizeComments,
    botUsernames,
    new Set(
      batchData.comments
        .filter((comment) => mutationWasDenied(comment.id, comment.body, seenMap))
        .map((comment) => comment.id),
    ),
  );
  const deniedRuleAutoResolveThreadIds = new Set(
    partition.ruleAutoResolveThreadIds.filter((id) => {
      const thread = batchData.reviewThreads.find((candidate) => candidate.id === id);
      return (
        thread?.isResolved !== false ||
        !canGenerateItemMutation(
          thread.id,
          threadTranscriptBody(thread),
          thread.viewerCanResolve,
          "resolve",
        )
      );
    }),
  );
  const visibleThreadCandidates = batchData.reviewThreads.filter(
    (t) => !partition.suppressedThreadIds.has(t.id) || deniedRuleAutoResolveThreadIds.has(t.id),
  );
  const resolveOtherHumanThreads = config.iterate.resolveOtherHumanThreads ?? "none";
  const threadMutationRouting = buildThreadMutationRouting(
    visibleThreadCandidates,
    botUsernames,
    partition.ruleAutoResolveThreadIds,
    resolveOtherHumanThreads,
  );
  const replyThreadIds = new Set(threadMutationRouting.replyThreadIds);
  const resolveThreadIds = new Set(threadMutationRouting.resolveThreadIds);
  const repeatableThreadIds = new Set(
    visibleThreadCandidates
      .filter(
        (thread) =>
          !mutationWasDenied(thread.id, threadTranscriptBody(thread), seenMap) &&
          threadHasAuthorizedMutation(thread, replyThreadIds, resolveThreadIds),
      )
      .map((thread) => thread.id),
  );
  const threadVisibility = classifyThreadVisibility(
    visibleThreadCandidates,
    seenMap,
    botUsernames,
    repeatableThreadIds,
    resolveOtherHumanThreads,
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
        !canGenerateItemMutation(
          id,
          batchData.reviewSummaries.find((review) => review.id === id)?.body ?? "",
          batchData.reviewSummaries.find((review) => review.id === id)?.viewerCanMinimize,
          "minimize",
        ),
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
    else if (!mutationWasDenied(r.id, r.body, seenMap)) seenSummaries.push(r);
  }
  const changesRequestedReviewVisibility = classifyChangesRequestedReviewsForDisplay(
    batchData.changesRequestedReviews.filter(
      (r) => !partition.suppressedChangesRequestedIds.has(r.id),
    ),
    seenMap,
    botUsernames,
    canGenerateGithubMutation(batchData.viewerAuthorization?.viewerCanAdminister, "dismiss"),
    new Set(
      batchData.changesRequestedReviews
        .filter((review) => mutationWasDenied(review.id, review.body, seenMap))
        .map((review) => review.id),
    ),
  );
  const approvedReviewVisibility = classifyReviewsForDisplay(batchData.approvedReviews, seenMap);
  const changesRequestedReviews = changesRequestedReviewVisibility.visible;
  const visibleChangesRequestedIds = new Set(changesRequestedReviews.map((review) => review.id));
  const changesRequestedReviewCount = batchData.changesRequestedReviews.filter((review) => {
    if (partition.suppressedChangesRequestedIds.has(review.id)) return false;
    const isBot = !isHumanAuthor(review) || isConfiguredBotAuthor(review, botUsernames);
    return (
      !isBot ||
      canGenerateItemMutation(
        review.id,
        review.body,
        batchData.viewerAuthorization?.viewerCanAdminister,
        "dismiss",
      ) ||
      visibleChangesRequestedIds.has(review.id)
    );
  }).length;
  const approvedReviews = approvedReviewVisibility.visible;
  const unreported = await collectUnreportedRequired(
    {
      batchData,
      checks: allChecks,
      suites: result.headWorkflowSuites ?? [],
      owner: repo.owner,
      name: repo.name,
      pr: prNumber,
      relevantEvents: config.checks.ciTriggerEvents,
    },
    context,
  );
  let status = computeStatus(
    verdict,
    threadVisibility.activeThreads.length + threadVisibility.resolutionOnlyThreads.length,
    visibleCommentClassification.actionable.length,
    mergeStatus,
    changesRequestedReviewCount,
    unreported.hasUnreportedRequired,
  );
  status = enforceTransportReadiness(status, batchData);

  // Resolve any pending mergeability refresh (and the resulting MERGED/CLOSED short-circuit)
  // before deciding what to persist below — deferWhileQueued must see the same final,
  // possibly-refreshed mergeStatus that commands/iterate/index.mts acts on, not the pre-refresh
  // snapshot. A conflict newly discovered by this REST read is exactly the kind of check-driven
  // signal that keeps a queued PR out of the deferral path.
  if (status === "READY" && !didRefreshMergeability) {
    const refreshed = await refreshReadyMergeability(
      prNumber,
      repo,
      batchData,
      verdict,
      threadVisibility.activeThreads.length + threadVisibility.resolutionOnlyThreads.length,
      visibleCommentClassification.actionable.length,
      changesRequestedReviewCount,
      unreported.hasUnreportedRequired,
    );
    batchData = refreshed.batchData;
    mergeStatus = refreshed.mergeStatus;
    status = refreshed.status;
    status = enforceTransportReadiness(status, batchData);
    if (mergeStatus.state === "MERGED" || mergeStatus.state === "CLOSED") {
      const terminal = buildTerminalReport(
        prNumber,
        repo,
        batchData,
        mergeStatus,
        mergeStatus.state,
      );
      if (result.fingerprint) {
        await storePrFingerprint(stateKey, result.fingerprint, terminal, config);
      }
      return terminal;
    }
  }

  // Mirrors the deferral gate in commands/iterate/index.mts exactly (via the shared
  // hasCheckDrivenActionableWork helper, so the two can't drift): when this tick's non-CI
  // actionable work (threads/comments/review summaries/changes-requested) will be held back
  // because the PR is queued, none of it was actually shown to the agent this tick —
  // persisting seen markers for it now would make it silently vanish from every later tick
  // once it's no longer "new" or "edited", even after the PR leaves the queue. A queued PR
  // that also has check-driven work (failing checks, actionable annotations, conflicts) is
  // NOT deferred — index.mts still renders these items via fix_code — so this must stay false
  // in that case too, or their seen markers would be suppressed while actually being shown.
  const deferWhileQueued =
    opts.merge === true &&
    batchData.isInMergeQueue === true &&
    config.actions.workWhileQueued !== true &&
    !hasCheckDrivenActionableWork(
      {
        failing: merged.failing,
        passing: merged.passing,
        skipped: merged.skipped,
        filtered: merged.filtered,
        ignored: merged.ignored,
      },
      mergeStatus.status,
    );
  if (opts.persistSeen !== false) {
    const successfulAnnotations = [
      ...merged.passing,
      ...merged.skipped,
      ...merged.filtered,
      ...merged.ignored,
    ]
      .filter((check) => check.conclusion === "SUCCESS")
      .flatMap((check) => check.annotations ?? []);
    const deferredMarkSeen = deferWhileQueued
      ? []
      : [
          ...firstLookComments.map((c) => markSeen(stateKey, c.id, c.body)),
          ...threadVisibility.toMarkSeen.map((t) =>
            markSeen(stateKey, t.id, threadTranscriptBody(t)),
          ),
          ...visibleCommentClassification.toMarkSeen.map((c) => markSeen(stateKey, c.id, c.body)),
          ...[...firstLookSummaries, ...editedSummaries].map((r) =>
            markSeen(stateKey, r.id, r.body),
          ),
          ...changesRequestedReviewVisibility.toMarkSeen.map((r) =>
            markSeen(stateKey, r.id, r.body),
          ),
          ...approvedReviewVisibility.toMarkSeen.map((r) => markSeen(stateKey, r.id, r.body)),
        ];
    await Promise.allSettled([
      ...successfulAnnotations.map((a) => markSeen(stateKey, a.id, annotationMarkerBody(a))),
      ...deferredMarkSeen,
      ...batchData.comments
        .filter(
          (c) =>
            partition.suppressedCommentIds.has(c.id) && !deniedRuleAutoResolveCommentIds.has(c.id),
        )
        .map((c) => markSeen(stateKey, c.id, c.body)),
      ...batchData.reviewThreads
        .filter(
          (t) =>
            partition.suppressedThreadIds.has(t.id) && !deniedRuleAutoResolveThreadIds.has(t.id),
        )
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
    ruleAutoResolveThreadIds: partition.ruleAutoResolveThreadIds.filter((id) => {
      const thread = batchData.reviewThreads.find((candidate) => candidate.id === id);
      return (
        thread?.isResolved === false &&
        canGenerateItemMutation(
          id,
          threadTranscriptBody(thread),
          thread.viewerCanResolve,
          "resolve",
        )
      );
    }),
    ruleAutoResolveCommentIds: partition.ruleAutoResolveCommentIds.filter((id) =>
      canGenerateItemMutation(
        id,
        batchData.comments.find((comment) => comment.id === id)?.body ?? "",
        batchData.comments.find((comment) => comment.id === id)?.viewerCanMinimize,
        "minimize",
      ),
    ),
    ruleAutoResolveReviewSummaryIds: partition.ruleAutoResolveReviewSummaryIds.filter((id) =>
      canGenerateItemMutation(
        id,
        batchData.reviewSummaries.find((review) => review.id === id)?.body ?? "",
        batchData.reviewSummaries.find((review) => review.id === id)?.viewerCanMinimize,
        "minimize",
      ),
    ),
  };
  if (
    opts.autoMinimizeSuppressed === true &&
    (authorizedPartition.ruleAutoResolveThreadIds.length > 0 ||
      authorizedPartition.ruleAutoResolveCommentIds.length > 0 ||
      authorizedPartition.ruleAutoResolveReviewSummaryIds.length > 0)
  ) {
    context?.invalidateReceiptSummary();
  }
  const {
    threadIds: authorizedRuleAutoResolveThreadIds,
    commentIds: ruleAutoResolveCommentIds,
    reviewSummaryIds: ruleAutoResolveReviewSummaryIds,
    autoResolved,
    autoMinimized,
    autoResolveErrors,
    errorReasons,
  } = await applySuppressedRuleAutoResolve({
    enabled: opts.autoMinimizeSuppressed === true,
    partition: authorizedPartition,
    batch: batchData,
    prNumber,
    repo,
  });
  const visibleMutationThreadIds = new Set(
    [...threadVisibility.activeThreads, ...threadVisibility.resolutionOnlyThreads].map(
      (thread) => thread.id,
    ),
  );
  const ruleAutoResolveThreadIds = [
    ...authorizedRuleAutoResolveThreadIds,
    ...[...deniedRuleAutoResolveThreadIds].filter((id) => visibleMutationThreadIds.has(id)),
  ];
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
  const report = {
    pr: prNumber,
    nodeId: batchData.nodeId,
    ...(batchData.transport && { transport: batchData.transport }),
    ...(batchData.transportUnavailable && {
      transportUnavailable: batchData.transportUnavailable,
    }),
    headSha: batchData.headRefOid,
    headRefName: unreported.headRefName,
    repo: `${repo.owner}/${repo.name}`,
    ...(batchData.viewerAuthorization && {
      viewerAuthorization: batchData.viewerAuthorization,
    }),
    status,
    baseBranch: batchData.baseRefName,
    ...(batchData.baseRefOid && { baseRefOid: batchData.baseRefOid }),
    ...(result.headCheckSuitesEmpty && { headCheckSuitesEmpty: true as const }),
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
      ...(verdict.ignoredNames.length > 0 && {
        ignoredNames: verdict.ignoredNames,
      }),
      ...(verdict.supersededNames.length > 0 && {
        supersededNames: verdict.supersededNames,
      }),
    },
    threads: {
      actionable: threadVisibility.activeThreads,
      resolutionOnly: threadVisibility.resolutionOnlyThreads,
      autoResolved,
      autoResolveErrors,
      ...(errorReasons.length > 0 && { autoResolveErrorReasons: errorReasons }),
      firstLook: threadVisibility.firstLookThreads,
      ...(ruleAutoResolveThreadIds.length > 0
        ? { ruleAutoResolveIds: ruleAutoResolveThreadIds }
        : undefined),
    },
    comments: {
      actionable: visibleCommentClassification.actionable,
      minimizeIds: [...visibleCommentClassification.minimizeIds, ...ruleAutoResolveCommentIds],
      firstLook: firstLookComments,
      ...(autoMinimized.length > 0 && { autoMinimized }),
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
    ...(batchData.allowedMergeMethods && {
      allowedMergeMethods: batchData.allowedMergeMethods,
    }),
    activity: batchData.activity,
    ...(hasQueueState && {
      mergeQueue: {
        enabled: Boolean(batchData.isMergeQueueEnabled),
        inQueue: Boolean(batchData.isInMergeQueue),
        ...(batchData.autoMergeRequest && {
          autoMergeRequest: batchData.autoMergeRequest,
        }),
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
        ...(headUpdatedAfterRemoval && {
          headUpdatedAfterRemoval: true as const,
        }),
        ...(removalsOnHead > 1 && { removalsOnHead }),
        ...(removalAcknowledged && { removalAcknowledged: true as const }),
      },
    }),
    ...(unreported.unreportedRequiredChecks && {
      unreportedRequiredChecks: unreported.unreportedRequiredChecks,
    }),
    ...(unreported.trunkBehindBy !== undefined && {
      trunkBehindBy: unreported.trunkBehindBy,
    }),
    ...(unreported.baseBehindBy !== undefined && {
      baseBehindBy: unreported.baseBehindBy,
    }),
    ...(unreported.actionsWorkflowInProgress && {
      actionsWorkflowInProgress: true as const,
    }),
    ...(unreported.stackBottomPr !== undefined && {
      stackBottomPr: unreported.stackBottomPr,
    }),
  };
  if (result.fingerprint) {
    await storePrFingerprint(stateKey, result.fingerprint, report, config);
  }
  if (restSnapshot) await storeRestSnapshotReport(stateKey, restSnapshot.digest, report, config);
  return report;
}
