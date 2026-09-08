import { normalizeBotUsernames } from "../comments/authors.mts";
import { loadConfig } from "../config/load.mts";
import { formatPrUrl } from "../pr-reference.mts";
import { buildPrShepherdCommand } from "../cli/runner.mts";
import { classifyItem, loadSeenMap } from "../state/seen-comments.mts";
import type {
  MergeStateStatus,
  PollSummaryChecks,
  PollSummaryCommandOptions,
  PollSummaryItem,
  PollSummaryReview,
  ReviewDecision,
} from "../types.mts";
import type { RepoInfo } from "./client.mts";
import type { RawAuthor, RawSummaryPr } from "./poll-summary-raw.mts";
import { normalizePollSummaryState, routePollSummary } from "./poll-summary-route.mts";
import picomatch from "picomatch";

const THREAD_COMMENT_SEPARATOR = "\n\n--- thread comment ---\n\n";

export async function summarizePollSummaryPr(
  raw: RawSummaryPr,
  repo: RepoInfo,
  opts: PollSummaryCommandOptions,
): Promise<PollSummaryItem> {
  const repoName = `${repo.owner}/${repo.name}`;
  const seen = await loadSeenMap({ owner: repo.owner, repo: repo.name, pr: raw.number });
  const checks = summarizeChecks(raw);
  const review = summarizeReview(raw, seen);
  const { action, reasons } = routePollSummary(raw, checks, review, opts);
  const stack = raw.stack
    ? {
        number: raw.stack.number,
        size: raw.stack.size,
        position: raw.stackEntry?.position ?? 0,
        baseRefName: raw.stack.baseRefName,
      }
    : undefined;
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
    ...(Object.keys(checks).length > 0 && { checks }),
    ...(Object.keys(review).length > 0 && { review }),
    ...(stack && { stack }),
    ...(!["wait", "cancel"].includes(action) && {
      pollCommand: buildPollCommand(repoName, raw.number, opts),
    }),
  };
}

function summarizeChecks(raw: RawSummaryPr): PollSummaryChecks {
  const headRollup = raw.commits.nodes[0]?.commit.statusCheckRollup;
  const queueRollup = raw.mergeQueueEntry?.headCommit?.statusCheckRollup;
  if (!headRollup && !queueRollup) {
    return { incomplete: true };
  }
  const counts = {
    passing: 0,
    failing: 0,
    inProgress: 0,
    skipped: 0,
    filtered: 0,
    ignored: 0,
  };
  const config = loadConfig();
  const relevantEvents = new Set([...config.checks.ciTriggerEvents, "merge_group"]);
  const isIgnored = picomatch(config.ignoreChecks, { nocase: true });
  const isProtected = picomatch(config.actions.neverCancelRuns, { nocase: true });
  const rollups = [headRollup, queueRollup].filter(
    (rollup) => rollup !== null && rollup !== undefined,
  );
  for (const context of rollups.flatMap((rollup) => rollup.contexts.nodes)) {
    const name = context.__typename === "CheckRun" ? context.name : context.context;
    const workflowName =
      context.__typename === "CheckRun"
        ? context.checkSuite?.workflowRun?.workflow?.name
        : undefined;
    if (isIgnored(name) && !isProtected(name) && !(workflowName && isProtected(workflowName))) {
      counts.ignored += 1;
      continue;
    }
    if (context.__typename === "CheckRun") {
      const event = context.checkSuite?.workflowRun?.event;
      if (event && !relevantEvents.has(event)) counts.filtered += 1;
      else if (context.status !== "COMPLETED") counts.inProgress += 1;
      else if (context.conclusion === "SUCCESS") counts.passing += 1;
      else if (context.conclusion === "SKIPPED" || context.conclusion === "NEUTRAL") {
        counts.skipped += 1;
      } else counts.failing += 1;
    } else if (context.state === "SUCCESS") counts.passing += 1;
    else if (context.state === "PENDING" || context.state === "EXPECTED") counts.inProgress += 1;
    else counts.failing += 1;
  }
  const summary: PollSummaryChecks = Object.fromEntries(
    Object.entries(counts).filter(([, count]) => count > 0),
  );
  if (rollups.some((rollup) => rollup.contexts.pageInfo.hasPreviousPage)) {
    summary.incomplete = true;
  }
  return summary;
}

function summarizeReview(
  raw: RawSummaryPr,
  seen: Awaited<ReturnType<typeof loadSeenMap>>,
): PollSummaryReview {
  const bots = normalizeBotUsernames(loadConfig().botUsernames);
  let actionable = 0;
  let incomplete =
    raw.comments.pageInfo.hasPreviousPage ||
    raw.reviews.pageInfo.hasPreviousPage ||
    raw.reviewThreads.pageInfo.hasPreviousPage;
  for (const comment of raw.comments.nodes) {
    if (!comment.isMinimized && classifyItem(comment.id, comment.body, seen) !== "unchanged") {
      actionable += 1;
    }
  }
  for (const review of latestReviewsByAuthor(raw.reviews.nodes)) {
    const isBot =
      review.author?.__typename === "Bot" || bots.has(review.author?.login.toLowerCase() ?? "");
    if (
      (review.state === "CHANGES_REQUESTED" &&
        (isBot || classifyItem(review.id, review.body, seen) !== "unchanged")) ||
      (review.state === "COMMENTED" &&
        review.body.trim().length > 0 &&
        !review.isMinimized &&
        classifyItem(review.id, review.body, seen) !== "unchanged")
    ) {
      actionable += 1;
    }
  }
  for (const thread of raw.reviewThreads.nodes) {
    if (thread.comments.pageInfo.hasPreviousPage) incomplete = true;
    const transcript = thread.comments.nodes
      .map((comment) => comment.body)
      .join(THREAD_COMMENT_SEPARATOR);
    const latest = thread.comments.nodes.at(-1);
    const repeatable =
      latest?.viewerDidAuthor === true ||
      latest?.author?.__typename === "Bot" ||
      bots.has(latest?.author?.login.toLowerCase() ?? "");
    const unseen = classifyItem(thread.id, transcript, seen) !== "unchanged";
    if (
      (!thread.isResolved && (repeatable || unseen)) ||
      ((thread.isResolved || thread.isOutdated) && unseen)
    ) {
      actionable += 1;
    }
  }
  return {
    ...(raw.comments.totalCount > 0 && { comments: raw.comments.totalCount }),
    ...(raw.reviews.totalCount > 0 && { reviews: raw.reviews.totalCount }),
    ...(raw.reviewThreads.totalCount > 0 && { threads: raw.reviewThreads.totalCount }),
    ...(actionable > 0 && { actionable }),
    ...(incomplete && { incomplete: true as const }),
  };
}

function latestReviewsByAuthor<T extends { author: RawAuthor | null }>(reviews: T[]): T[] {
  const seen = new Set<string>();
  return [...reviews].reverse().filter((review) => {
    const author = review.author?.login ?? `unknown:${seen.size}`;
    if (seen.has(author)) return false;
    seen.add(author);
    return true;
  });
}

function buildPollCommand(repo: string, pr: number, opts: PollSummaryCommandOptions): string {
  const args = [formatPrUrl(repo, pr), "--until-terminal"];
  if (opts.merge) args.push("--merge");
  if (opts.readyDelaySeconds !== undefined)
    args.push("--ready-delay", `${opts.readyDelaySeconds}s`);
  if (opts.stallTimeoutSeconds !== undefined) {
    args.push("--stall-timeout", `${opts.stallTimeoutSeconds}s`);
  }
  if (opts.noAutoMarkReady) args.push("--no-auto-mark-ready");
  return buildPrShepherdCommand(args).text;
}
