import type { ClassifyAction } from "../classify/types.mts";
import type { LoadedRule } from "../classify/loader.mts";
import { findSupersededApprovalIds } from "../comments/superseded-approvals.mts";
import { shouldMinimizeAuthor } from "../comments/minimize-policy.mts";
import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  normalizeAuthorType,
  type NormalizedBotUsernames,
} from "../comments/authors.mts";
import { classifyItem, mutationWasDenied, type SeenMarker } from "../state/seen-comments.mts";
import type { MinimizeCommentsPolicy } from "../config/load.mts";
import { canGenerateGithubMutation } from "./mutation-policy.mts";
import { parseCreatedAt } from "./batch-parser-helpers.mts";
import type { RawAuthor, RawSummaryPr } from "./poll-summary-raw.mts";
import { ruleHides, summaryRuleAction } from "./poll-summary-rule-items.mts";

type SummaryReviewNode = RawSummaryPr["reviews"]["nodes"][number];

const authorOf = (author: RawAuthor | null | undefined) => ({
  login: author?.login ?? "",
  authorType: normalizeAuthorType(author?.__typename, author?.login),
});

function summarySupersededApprovalIds(raw: RawSummaryPr): Set<string> {
  return findSupersededApprovalIds({
    reviews: raw.reviews.nodes
      .filter(
        (
          review,
        ): review is SummaryReviewNode & {
          state: "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED" | "COMMENTED";
        } =>
          review.state === "APPROVED" ||
          review.state === "CHANGES_REQUESTED" ||
          review.state === "DISMISSED" ||
          review.state === "COMMENTED",
      )
      .map((review) => ({
        id: review.id,
        author: review.author?.login ?? "unknown",
        state: review.state,
        body: review.body,
        createdAtUnix: review.createdAt ? parseCreatedAt(review.createdAt) : 0,
      })),
    latestReviews: (raw.latestReviews?.nodes ?? []).map((review) => ({
      login: review.author?.login ?? "unknown",
      state: review.state,
    })),
  });
}

function canMinimizeSummaryReview(
  review: SummaryReviewNode,
  blockedReviewIds: ReadonlySet<string>,
  seen: Map<string, SeenMarker>,
  minimizeComments: MinimizeCommentsPolicy,
  bots: NormalizedBotUsernames,
): boolean {
  const author = authorOf(review.author);
  return (
    !review.isMinimized &&
    !blockedReviewIds.has(review.id) &&
    !mutationWasDenied(review.id, review.body, seen) &&
    canGenerateGithubMutation(review.viewerCanMinimize, "minimize") &&
    shouldMinimizeAuthor(author.authorType, minimizeComments, author.login, bots)
  );
}

export function countActionableSummaryReviews(input: {
  raw: RawSummaryPr;
  summaryActions: ReadonlyMap<string, ClassifyAction>;
  rules: LoadedRule[];
  confirmed: ReadonlySet<string>;
  unconfirmed: ReadonlySet<string>;
  blockedReviewIds: ReadonlySet<string>;
  seen: Map<string, SeenMarker>;
  viewerCanAdminister: boolean | undefined;
  minimizeApprovals: boolean;
  minimizeSupersededApprovals: boolean;
  minimizeComments: MinimizeCommentsPolicy;
  bots: NormalizedBotUsernames;
}): number {
  const {
    raw,
    summaryActions,
    rules,
    confirmed,
    unconfirmed,
    blockedReviewIds,
    seen,
    viewerCanAdminister,
    minimizeApprovals,
    minimizeSupersededApprovals,
    minimizeComments,
    bots,
  } = input;
  const latestStateByAuthor = new Map(
    (raw.latestReviews?.nodes ?? []).flatMap((review) =>
      review.author ? [[review.author.login.toLowerCase(), review.state] as const] : [],
    ),
  );
  const supersededApprovalIds = summarySupersededApprovalIds(raw);
  const canMinimize = (review: SummaryReviewNode): boolean =>
    canMinimizeSummaryReview(review, blockedReviewIds, seen, minimizeComments, bots);
  let actionable = 0;

  for (const review of raw.reviews.nodes) {
    if (review.state === "COMMENTED" || review.state === "DISMISSED") {
      const action = summaryActions.get(review.id);
      if (!action || ruleHides(action, "review-summary", confirmed.has(review.id))) continue;
      if (
        unconfirmed.has(review.id) ||
        classifyItem(review.id, review.body, seen) !== "unchanged" ||
        canMinimize(review)
      )
        actionable += 1;
      continue;
    }
    if (review.state === "APPROVED") {
      if (
        (minimizeApprovals &&
          !review.isMinimized &&
          (classifyItem(review.id, review.body, seen) !== "unchanged" || canMinimize(review))) ||
        (minimizeSupersededApprovals && supersededApprovalIds.has(review.id) && canMinimize(review))
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
    if (
      !isBot ||
      (canGenerateGithubMutation(viewerCanAdminister, "dismiss") &&
        !mutationWasDenied(review.id, review.body, seen)) ||
      classifyItem(review.id, review.body, seen) !== "unchanged"
    )
      actionable += 1;
  }

  return actionable;
}
