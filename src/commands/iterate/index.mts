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
} from "./helpers.mts";
import { classifyReviewSummaries } from "./classify.mts";
import { applyStallGuard } from "./stall.mts";
import { buildWaitLog } from "./render.mts";
import { handleFixCode } from "./fix-code.mts";
import { buildRerunCiResult, handleRebase } from "./steps.mts";
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
  if (nowSeconds - lastCommitTime < cooldownSeconds) {
    return {
      action: "cooldown",
      pr: prNumber,
      repo: "",
      status: "UNKNOWN",
      state: "UNKNOWN" as const,
      mergeStateStatus: "UNKNOWN",
      copilotReviewInProgress: false,
      isDraft: false,
      shouldCancel: false,
      remainingSeconds: readyDelaySeconds,
      summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 0 },
      baseBranch: "",
      checks: [],
      log: "SKIP: CI still starting — waiting for first check to appear",
    };
  }

  let report = await runCheck({
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
      copilotReviewInProgress: report.mergeStatus.copilotReviewInProgress,
      isDraft: report.mergeStatus.isDraft,
      shouldCancel: true,
      remainingSeconds: 0,
      state: report.mergeStatus.state,
      summary: buildSummary(report),
      baseBranch: report.baseBranch,
      checks: buildRelevantChecks(report),
      action: "cancel",
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
    copilotReviewInProgress: report.mergeStatus.copilotReviewInProgress,
    isDraft: report.mergeStatus.isDraft,
    shouldCancel: readyState.shouldCancel,
    remainingSeconds: readyState.remainingSeconds,
    summary: buildSummary(report),
    baseBranch: report.baseBranch,
    checks: buildRelevantChecks(report),
  };

  if (readyState.shouldCancel) {
    return {
      ...base,
      action: "cancel",
      log: `CANCEL: PR #${base.pr} has been ready for review — ready-delay elapsed, stopping monitor`,
    };
  }

  const headSha = await getCurrentHeadSha();
  const stallKey = { owner: repoOwner, repo: repoName, pr: prNumber };

  const { minimizeIds: reviewSummaryIds, surfacedSummaries } = classifyReviewSummaries(
    report.reviewSummaries,
    report.approvedReviews,
    config.iterate.minimizeReviewSummaries,
  );
  const actionableChecks = report.checks.failing.filter((f) => f.failureKind === "actionable");
  const hasActionableWork =
    report.threads.actionable.length > 0 ||
    report.comments.actionable.length > 0 ||
    report.changesRequestedReviews.length > 0 ||
    actionableChecks.length > 0 ||
    report.mergeStatus.status === "CONFLICTS" ||
    reviewSummaryIds.length > 0 ||
    surfacedSummaries.length > 0;

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
      surfacedSummaries,
    });
  }

  const transientChecks = report.checks.failing.filter(
    (f) => f.failureKind === "timeout" || f.failureKind === "infrastructure",
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

  const hasFlaky = report.checks.failing.some((f) => f.failureKind === "flaky");
  if (hasFlaky && report.mergeStatus.status === "BEHIND" && config.actions.autoRebase) {
    return handleRebase(
      base,
      report,
      stallKey,
      stallTimeoutSeconds,
      headSha,
      prNumber,
      reviewSummaryIds,
    );
  }

  const mergeStateAllowsMarkReady =
    report.mergeStatus.mergeStateStatus === "CLEAN" ||
    (report.mergeStatus.mergeStateStatus === "DRAFT" && report.mergeStatus.isDraft);
  const canMarkReady =
    report.status === "READY" &&
    mergeStateAllowsMarkReady &&
    !report.mergeStatus.copilotReviewInProgress &&
    !readyState.shouldCancel &&
    report.mergeStatus.isDraft;

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
