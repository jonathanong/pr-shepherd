/* eslint-disable max-lines */
import { runCheck } from "../check.mts";
import { clearReadyDelay, updateReadyDelay } from "../ready-delay.mts";
import { getCurrentPrNumber } from "../../github/client.mts";
import { loadConfig } from "../../config/load.mts";
import { EXIT, ShepherdError } from "../../exit-codes.mts";
import { buildWaitLog, buildTerminalCancelResult, blockedCancelNote } from "./helpers.mts";
import { classifyReviewSummaries } from "./classify.mts";
import { applyStallGuard } from "./stall.mts";
import { clearStallState } from "../../state/iterate-stall.mts";
import { handleFixCode } from "./fix-code.mts";
import { normalizeBotUsernames } from "../../comments/authors.mts";
import { autoMinimizeComments } from "../../comments/resolve.mts";
import { hasCheckDrivenActionableWork } from "../check-annotations.mts";
import { buildReadyMergeOutcome, handleActiveMergeState } from "./merge-state.mts";
import { buildIterateBase } from "./base.mts";
import { markReadyIfAuthorized } from "./mark-ready.mts";
import type { IterateCommandOptions, IterateResult } from "../../types.mts";
import { withIterateApiUsage } from "./run.mts";
import { fetchRawSummaryPr } from "../../github/poll-summary.mts";
import { summarizePollSummaryPr } from "../../github/poll-summary-projector.mts";
import { fingerprintRawSummaryPr } from "../../github/poll-summary-fingerprint.mts";
import { currentQueueRemovalEvent } from "../../github/poll-summary-queue-removal.mts";
import { isCurrentSummaryReady } from "../../github/poll-summary-readiness.mts";
import {
  clearReadyReceipt,
  isReadyReceiptCurrent,
  readReadyReceipt,
  writeReadyReceipt,
} from "../../state/ready-receipts.mts";
import { stackDraftHold } from "./parent-first.mts";
import { findStaleNativeStackAncestry } from "./stale-ancestry.mts";
import { annotateBlockedWait, resolveCheckBlockerGate } from "./check-blocker-gate.mts";

export function runIterate(opts: IterateCommandOptions): Promise<IterateResult> {
  return withIterateApiUsage(opts, () => runIterateCore(opts));
}

async function runIterateCore(opts: IterateCommandOptions): Promise<IterateResult> {
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
  const receiptKey = { owner: repoOwner, repo: repoName, pr: report.pr };

  if (report.mergeStatus.state !== "OPEN") {
    await clearReadyDelay(report.pr, repoOwner, repoName);
    await clearReadyReceipt(receiptKey);
    await clearStallState(stallKey);
    return buildTerminalCancelResult(report);
  }

  const blockerGate = await resolveCheckBlockerGate(
    { owner: repoOwner, repo: repoName, pr: prNumber },
    report.checks.failing,
  );
  const deferredNames = blockerGate?.deferredNames;
  const reportForWork =
    deferredNames === undefined || deferredNames.size === 0
      ? report
      : {
          ...report,
          checks: {
            ...report.checks,
            failing: report.checks.failing.filter((check) => !deferredNames.has(check.name)),
          },
        };

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
  // Minimize already-seen review summaries in-process so they never become agent-facing work.
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
  // Hidden PR comments surface once so the agent can acknowledge them, but
  // they are not readiness evidence: bots keep editing hidden notices after a
  // PR settles. They never restart the ready-delay or void a READY receipt.
  const hasReadinessWork =
    report.threads.actionable.length > 0 ||
    report.threads.resolutionOnly.length > 0 ||
    report.threads.firstLook.length > 0 ||
    (report.threads.ruleAutoResolveIds?.length ?? 0) > 0 ||
    report.comments.actionable.length > 0 ||
    (report.comments.minimizeIds?.length ?? 0) > 0 ||
    report.changesRequestedReviews.length > 0 ||
    hasCheckDrivenActionableWork(reportForWork.checks, report.mergeStatus.status) ||
    reviewSummaryIds.length > 0 ||
    firstLookSummaries.length > 0 ||
    editedSummaries.length > 0 ||
    (config.iterate.minimizeApprovals && surfacedApprovals.length > 0);
  const hasActionableWork = hasReadinessWork || report.comments.firstLook.length > 0;

  const activeMerge = Boolean(
    opts.merge && (report.mergeQueue?.inQueue || report.mergeQueue?.autoMergeRequest),
  );
  const staleAncestry = await findStaleNativeStackAncestry(report, {
    owner: repoOwner,
    name: repoName,
  });
  const isCleanReadyState =
    report.status === "READY" &&
    !report.mergeStatus.isDraft &&
    !hasReadinessWork &&
    !activeMerge &&
    staleAncestry === null;
  const receiptCurrent = await revalidateReadyReceipt(receiptKey, report, hasReadinessWork);
  const headSha = report.headSha ?? "unknown";
  // The elapsed marker survives a hidden-comment acknowledgement tick and is
  // consumed only when this tick cancels or merges. A receipt that is still
  // current already proves the delay elapsed for this exact head, base, and
  // readiness evidence, so a rerun (e.g. with --merge) does not wait again.
  const readyState = await updateReadyDelay(
    report.pr,
    isCleanReadyState,
    readyDelaySeconds,
    repoOwner,
    repoName,
    { headSha, alreadyElapsed: receiptCurrent },
  );

  const base = buildIterateBase(reportForWork, readyState);

  // Checks (including merge-queue synthetic-commit checks) and hard conflicts are signals
  // GitHub itself is already acting on — the queue will eject the PR for these regardless of
  // what Shepherd does, so they always surface immediately. Only review threads/comments/
  // changes-requested reviews/review summaries — the categories that would otherwise cause a
  // Shepherd-initiated push while the PR sits safely in the queue — are eligible for deferral.
  const checkDrivenActionableWork = hasCheckDrivenActionableWork(
    reportForWork.checks,
    report.mergeStatus.status,
  );
  const deferWhileQueued =
    opts.merge === true &&
    report.mergeQueue?.inQueue === true &&
    config.actions.workWhileQueued !== true;

  if (hasActionableWork && !(deferWhileQueued && !checkDrivenActionableWork)) {
    return handleFixCode({
      base,
      report: reportForWork,
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
      releasedCheckNames: blockerGate?.releasedNames,
      ruleAutoResolveThreadIds: report.threads.ruleAutoResolveIds,
    });
  }

  const mergeStateResult = await handleActiveMergeState({
    enabled: opts.merge,
    active: activeMerge,
    base,
    report,
    stallKey,
    reviewSummaryIds,
    firstLookSummaries,
    editedSummaries,
    surfacedApprovals,
    minimizeApprovals: config.iterate.minimizeApprovals,
  });
  if (mergeStateResult) return annotateBlockedWait(mergeStateResult, blockerGate);

  if (staleAncestry) {
    return handleFixCode({
      base,
      report: reportForWork,
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
      releasedCheckNames: blockerGate?.releasedNames,
      repairInstructions: staleAncestry.instructions,
      ruleAutoResolveThreadIds: report.threads.ruleAutoResolveIds,
    });
  }

  const canMarkReady =
    report.status === "READY" &&
    report.mergeStatus.isDraft &&
    !report.mergeStatus.blockingBotReviewInProgress;
  const autoMarkReady = !opts.noAutoMarkReady && config.actions.autoMarkReady;
  const markReadyResult = await markReadyIfAuthorized(canMarkReady && autoMarkReady, base, report);
  if (markReadyResult) return markReadyResult;

  if (readyState.shouldCancel && !report.mergeStatus.isDraft) {
    const receiptWritten = receiptCurrent || (await recordReadyReceipt(receiptKey, report));
    // Aggregate --stack routing trusts only a layer's receipt, so an unwritten
    // one keeps the elapsed marker and retries next tick. A one-PR receipt
    // only lets a rerun skip the wait, so its failure never changes the action.
    if (!receiptWritten && report.mergeStatus.mergeRequirements?.stack !== undefined) {
      const receiptWait: IterateResult = {
        ...base,
        action: "wait",
        shouldCancel: false,
        log: `WAIT: PR #${base.pr} reached ready-delay but its stack readiness receipt could not be persisted`,
      };
      return annotateBlockedWait(
        await applyStallGuard(
          stallKey,
          stallTimeoutSeconds,
          headSha,
          base,
          prNumber,
          receiptWait,
          reportForWork,
          reviewSummaryIds,
        ),
        blockerGate,
      );
    }
    await clearReadyDelay(report.pr, repoOwner, repoName);
    await clearStallState(stallKey);
    const mergeResult = buildReadyMergeOutcome(opts.merge, true, base, report);
    if (mergeResult) return mergeResult;
    const cancelNote = blockedCancelNote(base);
    return {
      ...base,
      action: "cancel",
      reason: "ready-delay-elapsed",
      log: `CANCEL: PR #${base.pr} ${cancelNote} — ready-delay elapsed, stopping`,
    };
  }

  const hold = stackDraftHold(report, autoMarkReady);
  const wait = {
    ...base,
    action: "wait" as const,
    log: buildWaitLog(base),
    ...(hold && { stackDraftHold: hold }),
  } as IterateResult;
  return annotateBlockedWait(
    await applyStallGuard(
      stallKey,
      stallTimeoutSeconds,
      headSha,
      base,
      prNumber,
      wait,
      reportForWork,
      reviewSummaryIds,
    ),
    blockerGate,
  );
}

async function recordReadyReceipt(
  key: { owner: string; repo: string; pr: number },
  report: Awaited<ReturnType<typeof runCheck>>,
): Promise<boolean> {
  if (
    report.status !== "READY" ||
    report.mergeStatus.state !== "OPEN" ||
    report.mergeStatus.isDraft ||
    !report.headSha ||
    !report.baseRefOid
  )
    return false;
  try {
    const raw = await fetchRawSummaryPr(report.pr, { owner: key.owner, name: key.repo });
    const fingerprint = fingerprintRawSummaryPr(raw);
    if (
      fingerprint === null ||
      raw.state !== "OPEN" ||
      raw.isDraft ||
      raw.headRefOid !== report.headSha ||
      raw.baseRefOid !== report.baseRefOid
    )
      return false;
    const summary = await summarizePollSummaryPr(
      raw,
      { owner: key.owner, name: key.repo },
      { stackPrNumber: report.pr },
    );
    if (!isCurrentSummaryReady(raw, summary.checks ?? {}, summary.review ?? {})) return false;
    const removalEvent = currentQueueRemovalEvent(raw);
    await writeReadyReceipt({
      version: 1,
      ...key,
      headRefOid: raw.headRefOid,
      baseRefOid: raw.baseRefOid,
      status: "READY",
      isDraft: false,
      readinessFingerprint: fingerprint,
      ...(removalEvent?.id && {
        acknowledgedQueueRemovalId: removalEvent.id,
      }),
      recordedAtUnix: Math.floor(Date.now() / 1000),
    });
    return true;
  } catch {
    // The receipt is supplementary evidence. A transient summary fetch or
    // state-directory failure must not turn a completed one-PR poll into a
    // different Shepherd action.
    return false;
  }
}

/** Clear a stale READY receipt; return whether a current receipt remains. */
async function revalidateReadyReceipt(
  key: { owner: string; repo: string; pr: number },
  report: Awaited<ReturnType<typeof runCheck>>,
  hasReadinessWork: boolean,
): Promise<boolean> {
  const receipt = await readReadyReceipt(key);
  if (!receipt) return false;
  const retainQueuedReceipt =
    report.mergeQueue?.inQueue === true &&
    report.mergeStatus.state === "OPEN" &&
    !report.mergeStatus.isDraft &&
    Boolean(report.headSha && report.baseRefOid);
  if (
    report.mergeStatus.state !== "OPEN" ||
    report.mergeStatus.isDraft ||
    !report.headSha ||
    !report.baseRefOid ||
    (!retainQueuedReceipt && (report.status !== "READY" || hasReadinessWork))
  ) {
    await clearReadyReceipt(key);
    return false;
  }
  try {
    const raw = await fetchRawSummaryPr(report.pr, { owner: key.owner, name: key.repo });
    // Queue predecessors can advance the target branch without changing this
    // PR's source. Compare against the receipt's base only while both fresh
    // views still place the PR in the queue.
    const queuedBaseAdvanced = retainQueuedReceipt && raw.isInMergeQueue;
    const fingerprint = fingerprintRawSummaryPr(
      queuedBaseAdvanced ? { ...raw, baseRefOid: receipt.baseRefOid } : raw,
    );
    // The fresh snapshot must name the commits this tick evaluated, or the
    // receipt would vouch for a head or base the report never saw.
    const sameCommits =
      raw.headRefOid === report.headSha &&
      (queuedBaseAdvanced || raw.baseRefOid === report.baseRefOid);
    if (
      fingerprint === null ||
      !sameCommits ||
      !isReadyReceiptCurrent(receipt, {
        headRefOid: raw.headRefOid,
        baseRefOid: queuedBaseAdvanced ? receipt.baseRefOid : raw.baseRefOid,
        readinessFingerprint: fingerprint,
        status: "READY",
        isDraft: raw.isDraft,
      })
    ) {
      await clearReadyReceipt(key);
      return false;
    }
    return true;
  } catch {
    // Fail closed: an unreadable current snapshot cannot validate old evidence.
    await clearReadyReceipt(key);
    return false;
  }
}
