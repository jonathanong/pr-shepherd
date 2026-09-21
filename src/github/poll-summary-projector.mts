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
import { isCurrentSummaryReady } from "./poll-summary-readiness.mts";
import { normalizePollSummaryState, routePollSummary } from "./poll-summary-route.mts";
export async function summarizePollSummaryPr(
  raw: RawSummaryPr,
  repo: RepoInfo,
  opts: PollSummaryCommandOptions,
  viewerCanAdminister = false,
): Promise<PollSummaryItem> {
  const repoName = `${repo.owner}/${repo.name}`;
  const seen = await loadSeenMap({ owner: repo.owner, repo: repo.name, pr: raw.number });
  const checks = summarizePollSummaryChecks(raw);
  const review = await summarizePollSummaryReview(raw, seen, viewerCanAdminister);
  const blockingReviewerInProgress = detectBlockingReviewer(raw);
  let queueRemoval = currentQueueRemoval(raw);
  let { action, reasons } = routePollSummary(raw, checks, review, opts);
  let remainingSeconds: number | undefined;
  if (raw.isDraft && blockingReviewerInProgress && action === "mark_ready") {
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
      { retainElapsed: true },
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
  if (queueRemoval && receipt && receipt.recordedAtUnix > queueRemoval.createdAtUnix) {
    queueRemoval = undefined;
  }
  const currentReady = isCurrentSummaryReady(raw, checks, review, {
    allowQueuedProgress: opts.stackPrNumber !== undefined && raw.isInMergeQueue,
  });
  const readyReceipt =
    fingerprint !== null &&
    isReadyReceiptCurrent(receipt, {
      headRefOid: raw.headRefOid,
      baseRefOid: raw.baseRefOid,
      readinessFingerprint: fingerprint,
      status: currentReady ? "READY" : "PENDING",
      isDraft: raw.isDraft,
    });
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
      ? {
          pollCommand: buildPollCommand(repoName, raw.number, opts),
        }
      : {}),
  };
}

function currentQueueRemoval(raw: RawSummaryPr): PollSummaryItem["queueRemoval"] {
  const removal = raw.mergeQueueRemovals?.nodes[0];
  if (!removal) return undefined;
  const removalTime = Date.parse(removal.createdAt);
  if (!Number.isFinite(removalTime)) return undefined;
  const addition = raw.mergeQueueAdditions?.nodes[0];
  if (addition && Date.parse(addition.createdAt) > removalTime) return undefined;
  const parents = removal.beforeCommit?.parents?.nodes.map((parent) => parent.oid);
  if (!parents?.includes(raw.headRefOid)) return undefined;
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

function buildPollCommand(repo: string, pr: number, opts: PollSummaryCommandOptions): string {
  const args = [formatPrUrl(repo, pr), "--until-terminal"];
  if (opts.merge && opts.stackPrNumber === undefined) args.push("--merge");
  if (opts.readyDelaySeconds !== undefined)
    args.push("--ready-delay", `${opts.readyDelaySeconds}s`);
  if (opts.stallTimeoutSeconds !== undefined) {
    args.push("--stall-timeout", `${opts.stallTimeoutSeconds}s`);
  }
  if (opts.noAutoMarkReady) args.push("--no-auto-mark-ready");
  return buildPrShepherdCommand(args).text;
}
