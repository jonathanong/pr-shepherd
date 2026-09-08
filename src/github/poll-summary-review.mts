import { normalizeBotUsernames } from "../comments/authors.mts";
import { applyRules } from "../classify/apply.mts";
import { discoverRuleFiles, loadRules } from "../classify/loader.mts";
import { loadConfig } from "../config/load.mts";
import { getEffectiveCwd } from "../execution-context.mts";
import { classifyItem, type SeenMarker } from "../state/seen-comments.mts";
import type { ClassifyItem } from "../classify/types.mts";
import type { PollSummaryReview } from "../types.mts";
import type { RawAuthor, RawSummaryPr } from "./poll-summary-raw.mts";

const THREAD_COMMENT_SEPARATOR = "\n\n--- thread comment ---\n\n";

export async function summarizePollSummaryReview(
  raw: RawSummaryPr,
  seen: Map<string, SeenMarker>,
  viewerCanAdminister: boolean,
): Promise<PollSummaryReview> {
  const config = loadConfig();
  const bots = normalizeBotUsernames(config.botUsernames);
  const rules = await loadRules(discoverRuleFiles(getEffectiveCwd()));
  let actionable = 0;
  let incomplete =
    raw.comments.pageInfo.hasPreviousPage ||
    raw.reviews.pageInfo.hasPreviousPage ||
    raw.reviewThreads.pageInfo.hasPreviousPage;

  for (const comment of raw.comments.nodes) {
    if (
      !comment.isMinimized &&
      !isSuppressed(rules, "pr-comment", comment) &&
      classifyItem(comment.id, comment.body, seen) !== "unchanged"
    )
      actionable += 1;
  }

  const latestStateByAuthor = new Map(
    (raw.latestReviews?.nodes ?? []).flatMap((review) =>
      review.author ? [[review.author.login.toLowerCase(), review.state] as const] : [],
    ),
  );
  for (const review of raw.reviews.nodes) {
    if (review.state === "COMMENTED") {
      if (
        review.body.trim() !== "" &&
        !review.isMinimized &&
        !isSuppressed(rules, "review-summary", review) &&
        classifyItem(review.id, review.body, seen) !== "unchanged"
      )
        actionable += 1;
      continue;
    }
    if (review.state !== "CHANGES_REQUESTED") continue;
    const login = review.author?.login.toLowerCase();
    if (login && latestStateByAuthor.get(login) === "APPROVED") continue;
    if (isSuppressed(rules, "changes-requested", review)) continue;
    const isBot =
      review.author?.__typename === "Bot" || bots.has(review.author?.login.toLowerCase() ?? "");
    if (
      (isBot && viewerCanAdminister) ||
      classifyItem(review.id, review.body, seen) !== "unchanged"
    )
      actionable += 1;
  }

  for (const thread of raw.reviewThreads.nodes) {
    if (thread.comments.pageInfo.hasPreviousPage) incomplete = true;
    const root = thread.rootComments?.nodes[0] ?? thread.comments.nodes[0];
    const transcript = thread.comments.nodes
      .map((comment) => comment.body)
      .join(THREAD_COMMENT_SEPARATOR);
    if (isSuppressed(rules, "review-thread", root, thread.id, thread.path, transcript)) continue;
    const repeatable =
      root?.viewerDidAuthor === true ||
      root?.author?.__typename === "Bot" ||
      bots.has(root?.author?.login.toLowerCase() ?? "");
    const unseen = classifyItem(thread.id, transcript, seen) !== "unchanged";
    if (
      (!thread.isResolved && (repeatable || unseen)) ||
      ((thread.isResolved || thread.isOutdated) && unseen)
    )
      actionable += 1;
  }
  return {
    ...(raw.comments.totalCount > 0 && { comments: raw.comments.totalCount }),
    ...(raw.reviews.totalCount > 0 && { reviews: raw.reviews.totalCount }),
    ...(raw.reviewThreads.totalCount > 0 && { threads: raw.reviewThreads.totalCount }),
    ...(actionable > 0 && { actionable }),
    ...(incomplete && { incomplete: true as const }),
  };
}

function isSuppressed(
  rules: Parameters<typeof applyRules>[0],
  kind: ClassifyItem["kind"],
  raw:
    | {
        id: string;
        body: string;
        author: RawAuthor | null;
        authorAssociation?: string;
        url?: string;
      }
    | undefined,
  id = raw?.id ?? "unknown",
  path?: string | null,
  body = raw?.body ?? "",
): boolean {
  const item = {
    kind,
    id,
    author: raw?.author?.login ?? "unknown",
    authorType:
      raw?.author?.__typename === "Bot"
        ? "Bot"
        : raw?.author?.__typename === "User"
          ? "User"
          : "Unknown",
    ...(raw?.authorAssociation && { authorAssociation: raw.authorAssociation }),
    body,
    ...(raw?.url && { url: raw.url }),
    ...(kind === "review-thread" && { path }),
  } as ClassifyItem;
  return applyRules(rules, item).suppress === true;
}
