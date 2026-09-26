import { loadConfig } from "../config/load.mts";
import { updateReadyDelay } from "../commands/ready-delay.mts";
import { formatPrUrl } from "../pr-reference.mts";
import { buildPrShepherdCommand } from "../cli/runner.mts";
import { loadSeenMap } from "../state/seen-comments.mts";
import { isReadyReceiptCurrent, readReadyReceipt } from "../state/ready-receipts.mts";
import type {
  MergeStateStatus,
  PollSummaryCommandOptions,
  PollSummaryItem,
  ReviewDecision,
} from "../types.mts";
import type { RepoInfo } from "./client.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import { summarizePollSummaryReview } from "./poll-summary-review.mts";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
import { currentQueueRemovalEvent } from "./poll-summary-queue-removal.mts";
import { isCurrentSummaryReady } from "./poll-summary-readiness.mts";
import { applyOpenCheckBlockers } from "./poll-summary-check-blockers.mts";
import { normalizePollSummaryState, routePollSummary } from "./poll-summary-route.mts";
import { applyUnreportedRequiredChecks } from "./poll-summary-unreported.mts";
export async function summarizePollSummaryPr(
  raw: RawSummaryPr,
  repo: RepoInfo,
  opts: PollSummaryCommandOptions,
  viewerCanAdminister = false,
  mergeTargetContexts?: readonly string[],
): Promise<PollSummaryItem> {
  const repoName = `${repo.owner}/${repo.name}`;
  const seen = await loadSeenMap({ owner: repo.owner, repo: repo.name, pr: raw.number });
  const checks = summarizePollSummaryChecks(raw);
  applyUnreportedRequiredChecks(raw, checks, mergeTargetContexts);
  const review = await summarizePollSummaryReview(raw, seen, viewerCanAdminister);
  const blockingReviewerInProgress = detectBlockingReviewer(raw);
  const removalEvent = currentQueueRemovalEvent(raw);
  let { action, reasons } = routePollSummary(raw, checks, review, opts);
  let remainingSeconds: number | undefined;
  if (
    raw.isDraft &&
    blockingReviewerInProgress &&
    (action === "mark_ready" || reasons.includes("draft-auto-mark-ready-disabled"))
  ) {
    action = "wait";
    reasons = ["blocking-reviewer-in-progress"];
  }
  const appearsReady = reasons.includes("appears-ready");
  if (opts.stackPrNumber === undefined) {
    const readyDelaySeconds =
      opts.readyDelaySeconds ?? (loadConfig().watch?.readyDelayMinutes ?? 10) * 60;
    const readyState = await updateReadyDelay(
      raw.number,
      appearsReady,
      readyDelaySeconds,
      repo.owner,
      repo.name,
      { headSha: raw.headRefOid },
    );
    if (appearsReady && !readyState.shouldCancel) {
      action = "wait";
      reasons = ["ready-delay"];
      remainingSeconds = readyState.remainingSeconds;
    }
  }
  const stack = raw.stack
    ? {
        number: raw.stack.number,
        size: raw.stack.size,
        position: raw.stackEntry?.position ?? 0,
        baseRefName: raw.stack.baseRefName,
      }
    : undefined;
  const fingerprint = opts.stackPrNumber !== undefined ? fingerprintRawSummaryPr(raw) : null;
  const receipt = fingerprint
    ? await readReadyReceipt({ owner: repo.owner, repo: repo.name, pr: raw.number })
    : null;
  // A queued PR's target branch can advance as earlier queue entries merge.
  // Keep the pre-enqueue base binding for the receipt comparison while the
  // merge group itself supplies the current mergeability evidence.
  const receiptFingerprint =
    raw.isInMergeQueue && receipt
      ? fingerprintRawSummaryPr({ ...raw, baseRefOid: receipt.baseRefOid })
      : fingerprint;
  const currentReady = isCurrentSummaryReady(raw, checks, review, {
    allowQueuedProgress: opts.stackPrNumber !== undefined && raw.isInMergeQueue,
  });
  const readyReceipt =
    receiptFingerprint !== null &&
    isReadyReceiptCurrent(receipt, {
      headRefOid: raw.headRefOid,
      baseRefOid: raw.isInMergeQueue && receipt ? receipt.baseRefOid : raw.baseRefOid,
      readinessFingerprint: receiptFingerprint,
      status: currentReady ? "READY" : "PENDING",
      isDraft: raw.isDraft,
    });
  const queueRemoval =
    removalEvent?.id && readyReceipt && receipt?.acknowledgedQueueRemovalId === removalEvent.id
      ? undefined
      : removalEvent
        ? projectQueueRemoval(removalEvent)
        : undefined;
  const blocked = await applyOpenCheckBlockers(
    raw,
    repo,
    { action, reasons },
    checks,
    review,
    opts.stackPrNumber !== undefined,
  );
  action = blocked.action;
  reasons = blocked.reasons;
  return {
    pr: raw.number,
    repo: repoName,
    title: raw.title,
    url: raw.url || formatPrUrl(repoName, raw.number),
    action,
    reasons,
    state: normalizePollSummaryState(raw.state),
    mergeable: raw.mergeable as PollSummaryItem["mergeable"],
    mergeStateStatus: raw.mergeStateStatus as MergeStateStatus,
    ...(raw.reviewDecision && { reviewDecision: raw.reviewDecision as ReviewDecision }),
    headRefName: raw.headRefName,
    headRefOid: raw.headRefOid,
    baseRefName: raw.baseRefName,
    ...(raw.isDraft && { isDraft: true as const }),
    ...(raw.isInMergeQueue && { isInMergeQueue: true as const }),
    ...(queueRemoval && { queueRemoval }),
    ...(blockingReviewerInProgress && { blockingReviewerInProgress: true as const }),
    ...(remainingSeconds !== undefined && { remainingSeconds }),
    ...(Object.keys(checks).length > 0 && { checks }),
    ...(Object.keys(review).length > 0 && { review }),
    ...(stack && { stack }),
    ...(readyReceipt && { readyReceipt: true as const }),
    ...((opts.stackPrNumber !== undefined && raw.state === "OPEN") ||
    (!["wait", "cancel"].includes(action) &&
      !(opts.stackPrNumber !== undefined && raw.stack && action === "merge"))
      ? pollCommandFields(repoName, raw.number, raw.isDraft, opts)
      : {}),
    ...(blocked.pollProbe ? { pollProbe: true as const } : {}),
  };
}

function projectQueueRemoval(
  removal: NonNullable<ReturnType<typeof currentQueueRemovalEvent>>,
): PollSummaryItem["queueRemoval"] {
  const removalTime = Date.parse(removal.createdAt);
  const parents = removal.beforeCommit?.parents?.nodes.map((parent) => parent.oid) ?? [];
  return {
    reason: removal.reason,
    createdAtUnix: Math.floor(removalTime / 1000),
    ...(removal.actor?.login && { actor: removal.actor.login }),
    ...(removal.beforeCommit?.oid && { beforeCommitOid: removal.beforeCommit.oid }),
    beforeCommitParentOids: parents,
  };
}

function detectBlockingReviewer(raw: RawSummaryPr): boolean {
  const prefixes = (loadConfig().mergeStatus?.blockingReviewerLogins ?? []).map((login) =>
    login.toLowerCase(),
  );
  const matches = (author: { login: string } | null): boolean =>
    author !== null && prefixes.some((prefix) => author.login.toLowerCase().startsWith(prefix));
  return (
    (raw.reviewRequests?.nodes ?? []).some((request) => matches(request.requestedReviewer)) ||
    (raw.latestReviews?.nodes ?? []).some(
      (review) => review.state === "PENDING" && matches(review.author),
    )
  );
}

function pollCommandFields(
  repo: string,
  pr: number,
  isDraft: boolean,
  opts: PollSummaryCommandOptions,
): Pick<PollSummaryItem, "pollCommand" | "pollProbe"> {
  const autoMarkReadyDisabled =
    opts.noAutoMarkReady || loadConfig().actions.autoMarkReady === false;
  const boundedDraft = isDraft && autoMarkReadyDisabled;
  const args = boundedDraft
    ? [formatPrUrl(repo, pr), "--timeout", "1s", "--debounce", "0s", "--no-auto-mark-ready"]
    : [formatPrUrl(repo, pr), "--until-terminal"];
  if (opts.merge && opts.stackPrNumber === undefined) args.push("--merge");
  if (opts.readyDelaySeconds !== undefined)
    args.push("--ready-delay", `${opts.readyDelaySeconds}s`);
  if (opts.stallTimeoutSeconds !== undefined) {
    args.push("--stall-timeout", `${opts.stallTimeoutSeconds}s`);
  }
  if (opts.noAutoMarkReady && !boundedDraft) args.push("--no-auto-mark-ready");
  const pollCommand = buildPrShepherdCommand(args).text;
  return boundedDraft ? { pollCommand, pollProbe: true } : { pollCommand };
}
