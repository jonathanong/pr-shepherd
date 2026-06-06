import { runCheck } from "../check.mts";
import { updateReadyDelay } from "../ready-delay.mts";
import { getCurrentPrNumber } from "../../github/client.mts";
import { graphql } from "../../github/http.mts";
import { MARK_PR_READY_MUTATION } from "../../github/queries.mts";
import { loadConfig } from "../../config/load.mts";
import {
  getCurrentHeadSha,
  buildSummary,
  buildRelevantChecks,
  buildActiveChecks,
  buildWaitLog,
} from "./helpers.mts";
import { classifyReviewSummaries } from "./classify.mts";
import { applyStallGuard } from "./stall.mts";
import { clearStallState } from "../../state/iterate-stall.mts";
import { handleFixCode } from "./fix-code.mts";
import { normalizeBotUsernames } from "../../comments/authors.mts";
import type { IterateCommandOptions, IterateResult, IterateResultBase } from "../../types.mts";

export async function runIterate(opts: IterateCommandOptions): Promise<IterateResult> {
  const config = loadConfig();
  const botUsernames = normalizeBotUsernames(config.botUsernames);
  const readyDelaySeconds = opts.readyDelaySeconds ?? config.watch.readyDelayMinutes * 60;
  const stallTimeoutSeconds = opts.stallTimeoutSeconds ?? config.iterate.stallTimeoutMinutes * 60;

  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }
  const optsWithPr = { ...opts, prNumber };

  const report = await runCheck({
    ...optsWithPr,
    autoResolve: config.actions.autoResolveOutdated,
  });

  const [repoOwner, repoName] = report.repo.split("/");
  if (!repoOwner || !repoName) {
    throw new Error(`Unexpected repo format: "${report.repo}" (expected "owner/name")`);
  }
  const stallKey = { owner: repoOwner, repo: repoName, pr: prNumber };

  if (report.mergeStatus.state !== "OPEN") {
    const state = report.mergeStatus.state.toLowerCase();
    await updateReadyDelay(report.pr, false, readyDelaySeconds, repoOwner, repoName);
    await clearStallState(stallKey);
    return {
      pr: report.pr,
      repo: report.repo,
      status: report.status,
      mergeStateStatus: report.mergeStatus.mergeStateStatus,
      mergeStatus: report.mergeStatus.status,
      reviewDecision: report.mergeStatus.reviewDecision,
      blockingBotReviewInProgress: report.mergeStatus.blockingBotReviewInProgress,
      isDraft: report.mergeStatus.isDraft,
      shouldCancel: true,
      remainingSeconds: 0,
      state: report.mergeStatus.state,
      summary: buildSummary(report),
      baseBranch: report.baseBranch,
      branchProtection: report.branchProtection,
      checks: buildRelevantChecks(report),
      inProgressChecks: buildActiveChecks(report),
      ...(report.checks.ignoredNames.length > 0 && { ignoredNames: report.checks.ignoredNames }),
      activity: report.activity,
      action: "cancel",
      reason: report.mergeStatus.state === "MERGED" ? "merged" : "closed",
      log: `CANCEL: PR #${report.pr} is ${state} — stopping`,
    };
  }

  const {
    minimizeIds: reviewSummaryIds,
    firstLookSummaries,
    editedSummaries,
    surfacedApprovals,
  } = classifyReviewSummaries(
    {
      firstLook: report.firstLookSummaries,
      seen: report.reviewSummaries,
      edited: report.editedSummaries,
    },
    report.approvedReviews,
    config.iterate.minimizeApprovals,
    config.iterate.minimizeComments,
    botUsernames,
    [...report.threads.actionable, ...report.threads.resolutionOnly],
    report.ruleAutoResolveReviewSummaryIds,
  );
  const hasActionableWork =
    report.threads.actionable.length > 0 ||
    report.threads.resolutionOnly.length > 0 ||
    report.threads.firstLook.length > 0 ||
    (report.threads.ruleAutoResolveIds?.length ?? 0) > 0 ||
    report.comments.actionable.length > 0 ||
    (report.comments.minimizeIds?.length ?? 0) > 0 ||
    report.comments.firstLook.length > 0 ||
    report.changesRequestedReviews.length > 0 ||
    report.checks.failing.length > 0 ||
    report.mergeStatus.status === "CONFLICTS" ||
    reviewSummaryIds.length > 0 ||
    firstLookSummaries.length > 0 ||
    editedSummaries.length > 0;

  const isCleanReadyHandoff = report.status === "READY" && !hasActionableWork;
  const readyState = await updateReadyDelay(
    report.pr,
    isCleanReadyHandoff,
    readyDelaySeconds,
    repoOwner,
    repoName,
  );

  const base: IterateResultBase = {
    pr: report.pr,
    repo: report.repo,
    status: report.status,
    state: report.mergeStatus.state,
    mergeStateStatus: report.mergeStatus.mergeStateStatus,
    mergeStatus: report.mergeStatus.status,
    reviewDecision: report.mergeStatus.reviewDecision,
    blockingBotReviewInProgress: report.mergeStatus.blockingBotReviewInProgress,
    isDraft: report.mergeStatus.isDraft,
    shouldCancel: readyState.shouldCancel,
    remainingSeconds: readyState.remainingSeconds,
    summary: buildSummary(report),
    baseBranch: report.baseBranch,
    branchProtection: report.branchProtection,
    checks: buildRelevantChecks(report),
    inProgressChecks: buildActiveChecks(report),
    ...(report.checks.ignoredNames.length > 0 && { ignoredNames: report.checks.ignoredNames }),
    activity: report.activity,
  };

  if (readyState.shouldCancel) {
    await clearStallState(stallKey);
    let cancelNote: string;
    if (base.mergeStatus !== "BLOCKED") cancelNote = "has been ready for review";
    else if (base.reviewDecision === "REVIEW_REQUIRED") cancelNote = "is awaiting human review";
    else if (base.reviewDecision === "APPROVED") cancelNote = "is awaiting additional approvals";
    else cancelNote = "is awaiting human review or branch protection resolution";
    return {
      ...base,
      action: "cancel",
      reason: "ready-delay-elapsed",
      log: `CANCEL: PR #${base.pr} ${cancelNote} — ready-delay elapsed, stopping`,
    };
  }

  const headSha = (await getCurrentHeadSha()) ?? "unknown";

  if (hasActionableWork) {
    return handleFixCode({
      base,
      report,
      opts,
      headSha,
      stallKey,
      prNumber,
      stallTimeoutSeconds,
      repoOwner,
      repoName,
      reviewSummaryIds,
      firstLookSummaries,
      editedSummaries,
      surfacedApprovals,
      botUsernames,
      ruleAutoResolveThreadIds: report.threads.ruleAutoResolveIds,
    });
  }

  const canMarkReady =
    report.status === "READY" &&
    report.mergeStatus.isDraft &&
    !report.mergeStatus.blockingBotReviewInProgress &&
    !readyState.shouldCancel;

  if (canMarkReady && !opts.noAutoMarkReady && config.actions.autoMarkReady) {
    await graphql(MARK_PR_READY_MUTATION, { pullRequestId: report.nodeId });
    return {
      ...base,
      action: "mark_ready",
      markedReady: true,
      log: `MARKED READY: PR #${report.pr} converted from draft to ready for review`,
    };
  }

  return applyStallGuard(
    stallKey,
    stallTimeoutSeconds,
    headSha,
    base,
    prNumber,
    { ...base, action: "wait" as const, log: buildWaitLog(base) } as IterateResult,
    report,
    reviewSummaryIds,
  );
}
