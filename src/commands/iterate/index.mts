import { runCheck } from "../check.mts";
import { updateReadyDelay } from "../ready-delay.mts";
import { getCurrentPrNumber } from "../../github/client.mts";
import { loadConfig } from "../../config/load.mts";
import { EXIT, ShepherdError } from "../../exit-codes.mts";
import {
  getCurrentHeadSha,
  buildWaitLog,
  buildTerminalCancelResult,
  blockedCancelNote,
} from "./helpers.mts";
import { classifyReviewSummaries } from "./classify.mts";
import { applyStallGuard } from "./stall.mts";
import { clearStallState } from "../../state/iterate-stall.mts";
import { handleFixCode } from "./fix-code.mts";
import { normalizeBotUsernames } from "../../comments/authors.mts";
import { autoMinimizeComments } from "../../comments/resolve.mts";
import { checksWithActionableAnnotations } from "../check-annotations.mts";
import { buildReadyMergeResult, handleActiveMergeState } from "./merge-state.mts";
import { buildIterateBase } from "./base.mts";
import { markReadyIfAuthorized } from "./mark-ready.mts";
import type { IterateCommandOptions, IterateResult } from "../../types.mts";

export async function runIterate(opts: IterateCommandOptions): Promise<IterateResult> {
  const config = loadConfig();
  const botUsernames = normalizeBotUsernames(config.botUsernames);
  const readyDelaySeconds = opts.readyDelaySeconds ?? config.watch.readyDelayMinutes * 60;
  const stallTimeoutSeconds = opts.stallTimeoutSeconds ?? config.iterate.stallTimeoutMinutes * 60;

  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new ShepherdError(
      "No open PR found for current branch. Pass a PR number explicitly.",
      EXIT.UNAVAILABLE,
    );
  }
  const neverCancelRuns = opts.neverCancelRuns ?? config.actions.neverCancelRuns;

  const report = await runCheck({
    ...opts,
    prNumber,
    // Outdated Shepherd-visible threads are always resolved by iterate. The
    // old actions.autoResolveOutdated switch is retained only as an ignored
    // compatibility key in the config loader.
    autoResolve: true,
    autoMinimizeSuppressed: config.actions.autoMinimizeSuppressed,
  });

  const [repoOwner, repoName] = report.repo.split("/");
  if (!repoOwner || !repoName) {
    throw new ShepherdError(
      `Unexpected repo format: "${report.repo}" (expected "owner/name")`,
      EXIT.DATAERR,
    );
  }
  const stallKey = { owner: repoOwner, repo: repoName, pr: prNumber };

  if (report.mergeStatus.state !== "OPEN") {
    await updateReadyDelay(report.pr, false, readyDelaySeconds, repoOwner, repoName);
    await clearStallState(stallKey);
    return buildTerminalCancelResult(report);
  }

  const { minimizeIds, selfMinimizeIds, firstLookSummaries, editedSummaries, surfacedApprovals } =
    classifyReviewSummaries(
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
  // Already-seen review summaries have no new content to surface — minimize them
  // in-process so they never register as agent-facing actionable work (#313).
  // GitHub can still return a null/error/rate-limit result per ID without
  // throwing (autoMinimizeComments reports this via `errors`, not a rejection);
  // any ID it did not confirm minimized falls back into the agent-facing set so
  // the apply command remains a working fallback instead of silently dropping it.
  let reviewSummaryIds = minimizeIds;
  if (selfMinimizeIds.length > 0) {
    const { minimized } = await autoMinimizeComments(selfMinimizeIds);
    const minimizedIds = new Set(minimized);
    const unminimized = selfMinimizeIds.filter((id) => !minimizedIds.has(id));
    if (unminimized.length > 0) reviewSummaryIds = [...reviewSummaryIds, ...unminimized];
  }
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
    checksWithActionableAnnotations(report).length > 0 ||
    report.mergeStatus.status === "CONFLICTS" ||
    reviewSummaryIds.length > 0 ||
    firstLookSummaries.length > 0 ||
    editedSummaries.length > 0 ||
    (config.iterate.minimizeApprovals && surfacedApprovals.length > 0);

  const activeMerge = Boolean(
    opts.merge && (report.mergeQueue?.inQueue || report.mergeQueue?.autoMergeRequest),
  );
  const isCleanReadyHandoff = report.status === "READY" && !hasActionableWork && !activeMerge;
  const readyState = await updateReadyDelay(
    report.pr,
    isCleanReadyHandoff,
    readyDelaySeconds,
    repoOwner,
    repoName,
  );

  const base = buildIterateBase(report, readyState);

  const headSha = (await getCurrentHeadSha()) ?? "unknown";

  if (hasActionableWork) {
    return handleFixCode({
      base,
      report,
      opts: { ...opts, prNumber, neverCancelRuns },
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

  const mergeStateResult = await handleActiveMergeState({
    enabled: opts.merge,
    active: activeMerge,
    base,
    report,
    stallKey,
  });
  if (mergeStateResult) return mergeStateResult;

  const canMarkReady =
    report.status === "READY" &&
    report.mergeStatus.isDraft &&
    !report.mergeStatus.blockingBotReviewInProgress;

  const markReadyResult = await markReadyIfAuthorized(
    canMarkReady && !opts.noAutoMarkReady && config.actions.autoMarkReady,
    base,
    report,
  );
  if (markReadyResult) return markReadyResult;

  if (readyState.shouldCancel) {
    await clearStallState(stallKey);
    const mergeResult = buildReadyMergeResult(opts.merge, true, base, report);
    if (mergeResult) return mergeResult;
    const cancelNote = blockedCancelNote(base);
    return {
      ...base,
      action: "cancel",
      reason: "ready-delay-elapsed",
      log: `CANCEL: PR #${base.pr} ${cancelNote} — ready-delay elapsed, stopping`,
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
