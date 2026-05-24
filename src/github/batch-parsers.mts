import type {
  BatchPrData,
  BranchProtection,
  CheckRun,
  PrComment,
  Review,
  ReviewThread,
} from "../types.mts";
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
  extractRunId,
  extractCheckRunSummary,
  mapStatusContextState,
} from "./batch-parser-helpers.mts";

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

  const reviewThreads: ReviewThread[] = rawThreadPages.map((t) => {
    const comment = t.comments.nodes[0];
    const comments = t.comments.nodes.map((c) => ({
      id: c.id,
      isMinimized: c.isMinimized,
      ...(c.pullRequestReview?.id ? { reviewId: c.pullRequestReview.id } : undefined),
      author: c.author?.login ?? "unknown",
      authorType: mapAuthorType(c.author?.__typename, c.author?.login),
      body: c.body,
      url: c.url,
      createdAtUnix: parseCreatedAt(c.createdAt),
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
      body: comment?.body ?? "",
      url: comment?.url ?? "",
      createdAtUnix: comment ? parseCreatedAt(comment.createdAt) : 0,
      comments,
    };
  });

  const comments: PrComment[] = rawCommentNodes.map((c) => ({
    id: c.id,
    isMinimized: c.isMinimized,
    author: c.author?.login ?? "unknown",
    authorType: mapAuthorType(c.author?.__typename, c.author?.login),
    body: c.body,
    url: c.url,
    createdAtUnix: parseCreatedAt(c.createdAt),
  }));

  const changesRequestedReviews: Review[] = rawReviewNodes.map((r) => ({
    id: r.id,
    author: r.author?.login ?? "unknown",
    authorType: mapAuthorType(r.author?.__typename, r.author?.login),
    body: r.body,
  }));

  const reviewSummaries: Review[] = rawReviewSummaryNodes
    .filter((r) => !r.isMinimized && r.body.trim() !== "")
    .map((r) => ({
      id: r.id,
      author: r.author?.login ?? "unknown",
      authorType: mapAuthorType(r.author?.__typename, r.author?.login),
      body: r.body,
    }));

  // APPROVED reviews often have empty bodies (clicking "Approve" without a comment), so
  // we keep them — only the isMinimized filter applies. Monitor/iterate uses these IDs
  // when the user opts in to minimizing approvals.
  const approvedReviews: Review[] = rawApprovedReviewNodes
    .filter((r) => !r.isMinimized)
    .map((r) => ({
      id: r.id,
      author: r.author?.login ?? "unknown",
      authorType: mapAuthorType(r.author?.__typename, r.author?.login),
      body: r.body,
    }));

  const checks = rawCheckNodes.flatMap<CheckRun>((node) => {
    if (node.__typename === "CheckRun") {
      const event = node.checkSuite?.workflowRun?.event ?? null;
      const runId = extractRunId(node.detailsUrl);
      const summary = extractCheckRunSummary(node.title, node.summary);
      const rawCreatedAt = node.checkSuite
        ? (node.checkSuite.workflowRun?.createdAt ?? node.checkSuite.createdAt)
        : undefined;
      const rawUpdatedAt = node.checkSuite
        ? (node.checkSuite.workflowRun?.updatedAt ?? node.checkSuite.updatedAt)
        : undefined;
      const createdAtUnix = rawCreatedAt ? parseCreatedAt(rawCreatedAt) : undefined;
      const startedAtUnix = node.startedAt ? parseCreatedAt(node.startedAt) : undefined;
      const updatedAtUnix = rawUpdatedAt ? parseCreatedAt(rawUpdatedAt) : undefined;
      return [
        {
          id: node.id,
          name: node.name,
          status: node.status as CheckRun["status"],
          conclusion: node.conclusion as CheckRun["conclusion"],
          source: "check_run",
          detailsUrl: node.detailsUrl ?? "",
          event,
          runId,
          ...(createdAtUnix !== undefined && { createdAtUnix }),
          ...(startedAtUnix !== undefined && { startedAtUnix }),
          ...(updatedAtUnix !== undefined && { updatedAtUnix }),
          ...(summary !== undefined && { summary }),
        },
      ];
    }
    if (node.__typename === "StatusContext") {
      const { status, conclusion } = mapStatusContextState(node.state);
      const summary = node.description?.trim() || undefined;
      const createdAtUnix = node.createdAt ? parseCreatedAt(node.createdAt) : undefined;
      return [
        {
          name: node.context,
          status,
          conclusion,
          source: "status_context",
          detailsUrl: node.targetUrl ?? "",
          event: null,
          runId: null,
          ...(createdAtUnix !== undefined && { createdAtUnix }),
          ...(summary !== undefined && { summary }),
        },
      ];
    }
    return [];
  });

  const rawProtection = raw.baseRef?.branchProtectionRule ?? null;
  const branchProtection: BranchProtection | null = rawProtection
    ? {
        requiresApprovingReviews: rawProtection.requiresApprovingReviews,
        requiredApprovingReviewCount: rawProtection.requiredApprovingReviewCount,
        requiresConversationResolution: rawProtection.requiresConversationResolution,
        requiresStatusChecks: rawProtection.requiresStatusChecks,
        requiredStatusCheckContexts: rawProtection.requiredStatusCheckContexts ?? [],
      }
    : null;

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
    branchProtection,
  };
}
