import { runCheck } from "../check.mts";
import { updateReadyDelay } from "../ready-delay.mts";
import { getCurrentPrNumber } from "../../github/client.mts";
import { graphql } from "../../github/http.mts";
import { MARK_PR_READY_MUTATION } from "../../github/queries.mts";
import { loadConfig } from "../../config/load.mts";
import {
  getLastCommitTime,
  getCurrentHeadSha,
  buildSummary,
  buildRelevantChecks,
  buildCooldownResult,
} from "./helpers.mts";
import { classifyReviewSummaries } from "./classify.mts";
import { applyStallGuard } from "./stall.mts";
import { buildWaitLog } from "./render.mts";
import { handleFixCode } from "./fix-code.mts";
import { buildRerunCiResult } from "./steps.mts";
import type { IterateCommandOptions, IterateResult, IterateResultBase } from "../../types.mts";

export async function runIterate(opts: IterateCommandOptions): Promise<IterateResult> {
  const config = loadConfig();
  const cooldownSeconds = opts.cooldownSeconds ?? config.iterate.cooldownSeconds;
  const readyDelaySeconds = opts.readyDelaySeconds ?? config.watch.readyDelayMinutes * 60;
  const stallTimeoutSeconds = opts.stallTimeoutSeconds ?? config.iterate.stallTimeoutMinutes * 60;

  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }
  const optsWithPr = { ...opts, prNumber };

  const lastCommitTime = await getLastCommitTime();
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (lastCommitTime !== null && nowSeconds - lastCommitTime < cooldownSeconds) {
    return buildCooldownResult(prNumber, readyDelaySeconds);
  }

  const report = await runCheck({
    ...optsWithPr,
    autoResolve: config.actions.autoResolveOutdated,
  });

  if (report.mergeStatus.state !== "OPEN") {
    const state = report.mergeStatus.state.toLowerCase();
    return {
      pr: report.pr,
      repo: report.repo,
      status: report.status,
      mergeStateStatus: report.mergeStatus.mergeStateStatus,
      mergeStatus: report.mergeStatus.status,
      reviewDecision: report.mergeStatus.reviewDecision,
      copilotReviewInProgress: report.mergeStatus.copilotReviewInProgress,
      isDraft: report.mergeStatus.isDraft,
      shouldCancel: true,
      remainingSeconds: 0,
      state: report.mergeStatus.state,
      summary: buildSummary(report),
      baseBranch: report.baseBranch,
      checks: buildRelevantChecks(report),
      action: "cancel",
      reason: report.mergeStatus.state === "MERGED" ? "merged" : "closed",
      log: `CANCEL: PR #${report.pr} is ${state} — stopping monitor`,
    };
  }

  const [repoOwner, repoName] = report.repo.split("/");
  if (!repoOwner || !repoName) {
    throw new Error(`Unexpected repo format: "${report.repo}" (expected "owner/name")`);
  }
  const isReady = report.status === "READY";
  const readyState = await updateReadyDelay(
    report.pr,
    isReady,
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
    copilotReviewInProgress: report.mergeStatus.copilotReviewInProgress,
    isDraft: report.mergeStatus.isDraft,
    shouldCancel: readyState.shouldCancel,
    remainingSeconds: readyState.remainingSeconds,
    summary: buildSummary(report),
    baseBranch: report.baseBranch,
    checks: buildRelevantChecks(report),
  };

  if (readyState.shouldCancel) {
    let cancelNote: string;
    if (base.mergeStatus !== "BLOCKED") cancelNote = "has been ready for review";
    else if (base.reviewDecision === "REVIEW_REQUIRED") cancelNote = "is awaiting human review";
    else if (base.reviewDecision === "APPROVED") cancelNote = "is awaiting additional approvals";
    else cancelNote = "is awaiting human review or branch protection resolution";
    return {
      ...base,
      action: "cancel",
      reason: "ready-delay-elapsed",
      log: `CANCEL: PR #${base.pr} ${cancelNote} — ready-delay elapsed, stopping monitor`,
    };
  }

  const headSha = (await getCurrentHeadSha()) ?? "unknown";
  const stallKey = { owner: repoOwner, repo: repoName, pr: prNumber };

  const { minimizeIds: reviewSummaryIds, surfacedApprovals } = classifyReviewSummaries(
    report.reviewSummaries,
    report.approvedReviews,
    config.iterate.minimizeApprovals,
  );
  const actionableChecks = report.checks.failing.filter((f) => f.failureKind === "actionable");
  const hasActionableWork =
    report.threads.actionable.length > 0 ||
    report.comments.actionable.length > 0 ||
    report.changesRequestedReviews.length > 0 ||
    actionableChecks.length > 0 ||
    report.mergeStatus.status === "CONFLICTS" ||
    reviewSummaryIds.length > 0;

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
      surfacedApprovals,
    });
  }

  const transientChecks = report.checks.failing.filter(
    (f) => (f.failureKind === "timeout" || f.failureKind === "cancelled") && f.runId !== null,
  );
  if (transientChecks.length > 0) {
    return buildRerunCiResult(
      transientChecks,
      base,
      prNumber,
      stallKey,
      stallTimeoutSeconds,
      headSha,
      report,
      reviewSummaryIds,
    );
  }

  const canMarkReady =
    report.status === "READY" &&
    report.mergeStatus.isDraft &&
    !report.mergeStatus.copilotReviewInProgress &&
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
