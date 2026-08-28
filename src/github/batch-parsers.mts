import type { BatchPrData, PrComment, Review, ReviewThread } from "../types.mts";
import type {
  RawPr,
  RawThread,
  RawComment,
  RawReview,
  RawReviewSummary,
  RawContextNode,
} from "./batch-raw-types.mts";
import {
  mapAuthorType,
  parseCreatedAt,
  latestApprovedLogins,
  isReviewStale,
} from "./batch-parser-helpers.mts";
import { parseCheckNodes } from "./batch-parse-checks.mts";
import { requireContextNodes } from "./batch-response.mts";
import { buildPrActivitySummary } from "./activity.mts";
import { parseBranchProtection } from "./branch-protection.mts";
import {
  parseAutoMergeRequest,
  parseBranchRules,
  parseLatestMergeQueueRemoval,
  parseMergeQueueEntry,
  parseStack,
} from "./batch-parsers-rules.mts";

function parseReviewNode(r: RawReview | RawReviewSummary): Review {
  const base: Review = {
    id: r.id,
    author: r.author?.login ?? "unknown",
    authorType: mapAuthorType(r.author?.__typename, r.author?.login),
    ...(r.authorAssociation !== undefined && { authorAssociation: r.authorAssociation }),
    body: r.body,
    createdAtUnix: r.createdAt ? parseCreatedAt(r.createdAt) : 0,
  };
  if ("commit" in r && r.commit?.oid) {
    base.commitOid = r.commit.oid;
  }
  return base;
}

export function parseRawPr(
  raw: RawPr,
  rawThreadPages: RawThread[],
  rawCommentNodes: RawComment[],
  rawReviewNodes: RawReview[],
  rawReviewSummaryNodes: RawReviewSummary[],
  rawApprovedReviewNodes: RawReviewSummary[],
  rawCheckNodes: RawContextNode[],
): BatchPrData {
  const reviewRequests = (raw.reviewRequests?.nodes ?? []).flatMap((n) => {
    const login = n.requestedReviewer?.login ?? n.requestedReviewer?.name;
    return login ? [{ login }] : [];
  });

  const latestReviews = (raw.latestReviews?.nodes ?? []).map((n) => ({
    login: n.author?.login ?? "unknown",
    state: n.state,
  }));
  const crDone = latestApprovedLogins(latestReviews);
  const reviewThreads: ReviewThread[] = rawThreadPages.map((t) => {
    const comment = t.comments.nodes[0];
    const comments = t.comments.nodes.map((c) => ({
      id: c.id,
      isMinimized: c.isMinimized,
      ...(c.pullRequestReview?.id ? { reviewId: c.pullRequestReview.id } : undefined),
      author: c.author?.login ?? "unknown",
      authorType: mapAuthorType(c.author?.__typename, c.author?.login),
      ...(c.authorAssociation !== undefined && { authorAssociation: c.authorAssociation }),
      ...(c.viewerDidAuthor === true && { viewerDidAuthor: true as const }),
      body: c.body,
      url: c.url,
      createdAtUnix: c.createdAt ? parseCreatedAt(c.createdAt) : 0,
    }));
    return {
      id: t.id,
      isResolved: t.isResolved,
      isOutdated: t.isOutdated,
      isMinimized: comment?.isMinimized ?? false,
      path: t.path ?? comment?.path ?? null,
      line: t.line ?? comment?.line ?? null,
      startLine: t.startLine ?? comment?.startLine ?? null,
      ...(comment?.pullRequestReview?.id ? { reviewId: comment.pullRequestReview.id } : undefined),
      author: comment?.author?.login ?? "unknown",
      authorType: mapAuthorType(comment?.author?.__typename, comment?.author?.login),
      ...(comment?.authorAssociation !== undefined && {
        authorAssociation: comment.authorAssociation,
      }),
      ...(comment?.viewerDidAuthor === true && { viewerDidAuthor: true as const }),
      body: comment?.body ?? "",
      url: comment?.url ?? "",
      createdAtUnix: comment?.createdAt ? parseCreatedAt(comment.createdAt) : 0,
      comments,
    };
  });

  const comments: PrComment[] = rawCommentNodes.map((c) => ({
    id: c.id,
    isMinimized: c.isMinimized,
    author: c.author?.login ?? "unknown",
    authorType: mapAuthorType(c.author?.__typename, c.author?.login),
    ...(c.authorAssociation !== undefined && { authorAssociation: c.authorAssociation }),
    body: c.body,
    url: c.url,
    createdAtUnix: c.createdAt ? parseCreatedAt(c.createdAt) : 0,
  }));

  const allChangesRequestedReviews: Review[] = rawReviewNodes.map((r) => {
    const review = parseReviewNode(r);
    if (isReviewStale(review, raw.headRefOid, reviewThreads)) {
      review.staleReview = true;
    }
    return review;
  });
  const changesRequestedReviews: Review[] = allChangesRequestedReviews.filter(
    (r) => !crDone.has(r.author),
  );

  const reviewSummaries: Review[] = rawReviewSummaryNodes
    .filter((r) => !r.isMinimized && r.body.trim() !== "")
    .map((r) => parseReviewNode(r));

  // APPROVED reviews often have empty bodies (clicking "Approve" without a comment), so
  // we keep them — only the isMinimized filter applies. Monitor/iterate uses these IDs
  // when the user opts in to minimizing approvals.
  const approvedReviews: Review[] = rawApprovedReviewNodes
    .filter((r) => !r.isMinimized)
    .map((r) => parseReviewNode(r));

  const checks = parseCheckNodes(rawCheckNodes);
  const queueHead = raw.mergeQueueEntry?.headCommit;
  const removedQueueHead = raw.mergeQueueRemovals?.nodes[0]?.beforeCommit;
  const mergeQueueChecks = parseCheckNodes(
    queueHead?.statusCheckRollup
      ? requireContextNodes(queueHead.statusCheckRollup.contexts.nodes)
      : undefined,
    queueHead?.oid,
  );
  const removedMergeQueueChecks = parseCheckNodes(
    removedQueueHead?.statusCheckRollup
      ? requireContextNodes(removedQueueHead.statusCheckRollup.contexts.nodes)
      : undefined,
    removedQueueHead?.oid,
  );

  return {
    nodeId: raw.id,
    number: raw.number,
    state: raw.state as BatchPrData["state"],
    isDraft: raw.isDraft,
    mergeable: raw.mergeable as BatchPrData["mergeable"],
    mergeStateStatus: raw.mergeStateStatus as BatchPrData["mergeStateStatus"],
    reviewDecision: (raw.reviewDecision ?? null) as BatchPrData["reviewDecision"],
    headRefOid: raw.headRefOid,
    headRefName: raw.headRefName,
    headRepoWithOwner: raw.headRepository?.nameWithOwner ?? null,
    baseRefName: raw.baseRefName,
    reviewRequests,
    latestReviews,
    reviewThreads,
    comments,
    changesRequestedReviews,
    reviewSummaries,
    approvedReviews,
    checks,
    branchProtection: parseBranchProtection(raw),
    branchRules: parseBranchRules(raw.baseRef),
    isInMergeQueue: raw.isInMergeQueue ?? false,
    isMergeQueueEnabled: raw.isMergeQueueEnabled ?? false,
    mergeQueueEntry: parseMergeQueueEntry(raw.mergeQueueEntry),
    autoMergeRequest: parseAutoMergeRequest(raw.autoMergeRequest),
    latestMergeQueueRemoval: parseLatestMergeQueueRemoval(raw),
    ...(mergeQueueChecks.length > 0 && { mergeQueueChecks }),
    ...(queueHead?.statusCheckRollup?.contexts.pageInfo.hasNextPage && {
      mergeQueueChecksIncomplete: true as const,
    }),
    ...(removedMergeQueueChecks.length > 0 && { removedMergeQueueChecks }),
    ...(removedQueueHead?.statusCheckRollup?.contexts.pageInfo.hasNextPage && {
      removedMergeQueueChecksIncomplete: true as const,
    }),
    stack: parseStack(raw),
    activity: buildPrActivitySummary(
      raw,
      comments,
      reviewThreads,
      reviewSummaries,
      allChangesRequestedReviews,
      approvedReviews,
    ),
  };
}
