import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  normalizeAuthorType,
  normalizeBotUsernames,
} from "../comments/authors.mts";
import { loadClassifyRules } from "../classify/loader.mts";
import type { ClassifyAction } from "../classify/types.mts";
import { loadConfig } from "../config/load.mts";
import { getEffectiveCwd } from "../execution-context.mts";
import { classifyItem, mutationWasDenied, type SeenMarker } from "../state/seen-comments.mts";
import { threadEndedByShepherd } from "../comments/marker.mts";
import { threadTranscriptBodies } from "../threads/transcript.mts";
import type { PollSummaryReview, PollSummaryRuleAutoResolve } from "../types.mts";
import type { RawAuthor, RawSummaryPr } from "./poll-summary-raw.mts";
import { canGenerateGithubMutation } from "./mutation-policy.mts";
import {
  applySummaryRuleAutoResolve,
  type SummaryAutoResolve,
  type SummaryRuleActions,
  type SummaryStateKey,
} from "./poll-summary-rule-auto-resolve.mts";
import { countCommentWork, repeatingThreadIds } from "./poll-summary-review-parity.mts";
import { ruleHides, summaryRuleAction } from "./poll-summary-rule-items.mts";

const authorOf = (author: RawAuthor | null | undefined) => ({
  login: author?.login ?? "",
  authorType: normalizeAuthorType(author?.__typename, author?.login),
});

/**
 * Count the review work a compact row routes to the full check. With `autoResolveKey` and
 * `actions.auto-minimize-suppressed` on, rule-driven auto-resolve runs first, exactly as in the
 * one-PR path, so a handled bot notice never sends the row to triage.
 */
export async function evaluatePollSummaryReview(
  raw: RawSummaryPr,
  seen: Map<string, SeenMarker>,
  viewerCanAdminister: boolean | undefined,
  autoResolveKey?: SummaryStateKey,
): Promise<{ review: PollSummaryReview; ruleAutoResolve?: PollSummaryRuleAutoResolve }> {
  const config = loadConfig();
  const bots = normalizeBotUsernames(config["bot-usernames"]);
  const rules = await loadClassifyRules(getEffectiveCwd(), config.standardRules);
  let actionable = 0;
  let incomplete =
    raw.comments.pageInfo.hasPreviousPage ||
    raw.reviews.pageInfo.hasPreviousPage ||
    raw.reviewThreads.pageInfo.hasPreviousPage;

  // A pre-minimized comment is a first-look acknowledgement, never readiness work.
  const actions: Record<keyof SummaryRuleActions, Map<string, ClassifyAction>> = {
    comments: new Map(),
    summaries: new Map(),
    threads: new Map(),
  };
  for (const comment of raw.comments.nodes)
    if (!comment.isMinimized)
      actions.comments.set(comment.id, summaryRuleAction(rules, "pr-comment", comment));
  for (const review of raw.reviews.nodes)
    if (review.state === "COMMENTED" && review.body.trim() !== "" && !review.isMinimized)
      actions.summaries.set(review.id, summaryRuleAction(rules, "review-summary", review));
  const threadView = raw.reviewThreads.nodes.map((thread) => {
    const truncated = thread.comments.pageInfo.hasPreviousPage;
    if (truncated) incomplete = true;
    const root = thread.comments.nodes[0];
    const transcript = threadTranscriptBodies(thread.comments.nodes.map((c) => c.body));
    // The window's last comment is the thread's last only when nothing lies beyond it.
    const ended =
      thread.isResolved === true &&
      !truncated &&
      threadEndedByShepherd({ body: root?.body ?? "", comments: thread.comments.nodes });
    if (!ended)
      actions.threads.set(
        thread.id,
        summaryRuleAction(
          rules,
          "review-thread",
          root,
          thread.id,
          thread.path ?? root?.path ?? null,
          root?.body ?? "",
        ),
      );
    return { thread, truncated, root, transcript, ended };
  });

  const handled: SummaryAutoResolve =
    autoResolveKey && config.actions["auto-minimize-suppressed"]
      ? await applySummaryRuleAutoResolve({ raw, actions, seen, key: autoResolveKey })
      : { confirmed: new Set(), unconfirmed: new Set() };
  const { confirmed, unconfirmed } = handled;

  actionable += countCommentWork(
    raw.comments.nodes.filter((comment) => {
      const action = actions.comments.get(comment.id);
      return action !== undefined && !ruleHides(action, "pr-comment", confirmed.has(comment.id));
    }),
    unconfirmed,
    seen,
    config.iterate["minimize-comments"],
    bots,
  );

  const latestStateByAuthor = new Map(
    (raw.latestReviews?.nodes ?? []).flatMap((review) =>
      review.author ? [[review.author.login.toLowerCase(), review.state] as const] : [],
    ),
  );
  for (const review of raw.reviews.nodes) {
    if (review.state === "COMMENTED") {
      const action = actions.summaries.get(review.id);
      if (!action || ruleHides(action, "review-summary", confirmed.has(review.id))) continue;
      if (unconfirmed.has(review.id) || classifyItem(review.id, review.body, seen) !== "unchanged")
        actionable += 1;
      continue;
    }
    // An approval is surfaced once, as work, when iterate.minimize-approvals is on.
    if (review.state === "APPROVED") {
      if (
        config.iterate["minimize-approvals"] &&
        !review.isMinimized &&
        classifyItem(review.id, review.body, seen) !== "unchanged"
      )
        actionable += 1;
      continue;
    }
    if (review.state !== "CHANGES_REQUESTED") continue;
    const login = review.author?.login.toLowerCase();
    if (login && latestStateByAuthor.get(login) === "APPROVED") continue;
    if (
      ruleHides(summaryRuleAction(rules, "changes-requested", review), "changes-requested", false)
    )
      continue;
    const author = authorOf(review.author);
    const isBot = !isHumanAuthor(author) || isConfiguredBotAuthor(author, bots);
    // The full check counts a human changes-requested review whether or not it was seen.
    if (
      !isBot ||
      (canGenerateGithubMutation(viewerCanAdminister, "dismiss") &&
        !mutationWasDenied(review.id, review.body, seen)) ||
      classifyItem(review.id, review.body, seen) !== "unchanged"
    )
      actionable += 1;
  }

  const repeating = repeatingThreadIds(
    threadView,
    seen,
    bots,
    config.iterate["resolve-other-human-threads"],
  );
  for (const { thread, truncated, transcript, ended } of threadView) {
    const action = actions.threads.get(thread.id);
    if (ended || !action) continue;
    // Rules read the root, so a resolved or outdated thread satisfies its auto-resolve match.
    const satisfied =
      confirmed.has(thread.id) || thread.isResolved === true || thread.isOutdated === true;
    if (ruleHides(action, "review-thread", satisfied)) continue;
    if (unconfirmed.has(thread.id)) {
      actionable += 1;
      continue;
    }
    // The marker hashes the full transcript, which a window never reproduces. A long resolved
    // thread is seen once any marker exists; any other long thread cannot prove it was seen.
    const unseen = truncated
      ? !(thread.isResolved === true && seen.has(thread.id))
      : classifyItem(thread.id, transcript, seen) !== "unchanged";
    if (
      (thread.isResolved === false && (repeating.has(thread.id) || unseen)) ||
      (thread.isResolved === undefined && unseen) ||
      ((thread.isResolved || thread.isOutdated) && unseen)
    )
      actionable += 1;
  }
  const review: PollSummaryReview = {
    ...(raw.comments.totalCount > 0 && { comments: raw.comments.totalCount }),
    ...(raw.reviews.totalCount > 0 && { reviews: raw.reviews.totalCount }),
    ...(raw.reviewThreads.totalCount > 0 && { threads: raw.reviewThreads.totalCount }),
    ...(actionable > 0 && { actionable }),
    ...(incomplete && { incomplete: true as const }),
  };
  return { review, ...(handled.report && { ruleAutoResolve: handled.report }) };
}
