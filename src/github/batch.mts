/**
 * Executes the primary batch GraphQL query and parses the raw GitHub response
 * into shepherd's typed `BatchPrData` shape.
 *
 * The batch query fetches CI checks + review threads + PR comments + merge
 * status in a single network round-trip, drastically reducing API call counts
 * compared to the previous per-agent approach.
 */

import { graphql, graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { paginateForward, paginateBackward } from "./pagination.mts";
import { BATCH_PR_QUERY } from "./queries.mts";
import type {
  BatchPrData,
  CheckConclusion,
  CheckRun,
  CheckStatus,
  PrComment,
  Review,
  ReviewThread,
} from "../types.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BatchResult {
  data: BatchPrData;
  rateLimit?: RateLimitInfo;
}

/**
 * Fetch all PR data needed for a `shepherd check` in one (or a few, if paginating) GraphQL requests.
 */
export async function fetchPrBatch(pr: number, repo: RepoInfo): Promise<BatchResult> {
  // First page: no cursor variables.
  const result = await graphqlWithRateLimit<RawBatchResponse>(BATCH_PR_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    pr,
  });

  const raw = result.data.repository.pullRequest;
  if (!raw) {
    throw new Error(`PR #${pr} not found`);
  }

  // Paginate reviewThreads backward if the first page is incomplete.
  let rawThreadPages = raw.reviewThreads.nodes;
  if (raw.reviewThreads.pageInfo.hasPreviousPage && raw.reviewThreads.pageInfo.startCursor) {
    // Pass startCursor so paginateBackward fetches pages *before* the already-
    // fetched first page instead of re-fetching it from the start.
    const extra = await paginateBackward<RawThread>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { threadsCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.reviewThreads;
    }, raw.reviewThreads.pageInfo.startCursor);
    // extra contains pages before the first page.
    rawThreadPages = [...extra, ...rawThreadPages];
  }

  // Paginate comments backward if the first page is incomplete.
  let rawCommentNodes = raw.comments.nodes;
  if (raw.comments.pageInfo.hasPreviousPage && raw.comments.pageInfo.startCursor) {
    const extra = await paginateBackward<RawComment>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { commentsCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.comments;
    }, raw.comments.pageInfo.startCursor);
    rawCommentNodes = [...extra, ...rawCommentNodes];
  }

  // Paginate CHANGES_REQUESTED reviews backward if the first page is incomplete.
  let rawReviewNodes = raw.changesRequestedReviews.nodes;
  if (
    raw.changesRequestedReviews.pageInfo.hasPreviousPage &&
    raw.changesRequestedReviews.pageInfo.startCursor
  ) {
    const extra = await paginateBackward<RawReview>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { changesRequestedCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.changesRequestedReviews;
    }, raw.changesRequestedReviews.pageInfo.startCursor);
    rawReviewNodes = [...extra, ...rawReviewNodes];
  }

  // Paginate COMMENTED review summaries backward if the first page is incomplete.
  let rawReviewSummaryNodes = raw.reviewSummaries.nodes;
  if (
    raw.reviewSummaries.pageInfo.hasPreviousPage &&
    raw.reviewSummaries.pageInfo.startCursor
  ) {
    const extra = await paginateBackward<RawReviewSummary>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { reviewSummariesCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.reviewSummaries;
    }, raw.reviewSummaries.pageInfo.startCursor);
    rawReviewSummaryNodes = [...extra, ...rawReviewSummaryNodes];
  }

  // Paginate check contexts forward if the first page is incomplete.
  let rawCheckNodes = raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
  const checksPageInfo = raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.pageInfo;
  if (checksPageInfo?.hasNextPage && checksPageInfo.endCursor) {
    // Pass endCursor so paginateForward fetches pages *after* the already-
    // fetched first page instead of re-fetching it from the start.
    const extra = await paginateForward<RawContextNode>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { checksCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      const ctxs = pr2?.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
      return ctxs ?? { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] };
    }, checksPageInfo.endCursor);
    rawCheckNodes = [...rawCheckNodes, ...extra];
  }

  const data = parseRawPr(raw, rawThreadPages, rawCommentNodes, rawReviewNodes, rawReviewSummaryNodes, rawCheckNodes);
  return { data, rateLimit: result.rateLimit };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseRawPr(
  raw: RawPr,
  rawThreadPages: RawThread[],
  rawCommentNodes: RawComment[],
  rawReviewNodes: RawReview[],
  rawReviewSummaryNodes: RawReviewSummary[],
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
    return {
      id: t.id,
      isResolved: t.isResolved,
      isOutdated: t.isOutdated,
      isMinimized: comment?.isMinimized ?? false,
      path: comment?.path ?? null,
      line: comment?.line ?? null,
      author: comment?.author?.login ?? "unknown",
      body: comment?.body ?? "",
      createdAtUnix: comment ? parseCreatedAt(comment.createdAt) : 0,
    };
  });

  const comments: PrComment[] = rawCommentNodes.map((c) => ({
    id: c.id,
    isMinimized: c.isMinimized,
    author: c.author?.login ?? "unknown",
    body: c.body,
    createdAtUnix: parseCreatedAt(c.createdAt),
  }));

  const changesRequestedReviews: Review[] = rawReviewNodes.map((r) => ({
    id: r.id,
    author: r.author?.login ?? "unknown",
    body: r.body,
  }));

  const reviewSummaries: Review[] = rawReviewSummaryNodes
    .filter((r) => !r.isMinimized && r.body.trim() !== "")
    .map((r) => ({
      id: r.id,
      author: r.author?.login ?? "unknown",
      body: r.body,
    }));

  const checks: CheckRun[] = rawCheckNodes.flatMap((node) => {
    if (node.__typename === "CheckRun") {
      const event = node.checkSuite?.workflowRun?.event ?? null;
      const runId = extractRunId(node.detailsUrl);
      return [
        {
          name: node.name,
          status: node.status as CheckRun["status"],
          conclusion: node.conclusion as CheckRun["conclusion"],
          detailsUrl: node.detailsUrl ?? "",
          event,
          runId,
        },
      ];
    }
    if (node.__typename === "StatusContext") {
      const { status, conclusion } = mapStatusContextState(node.state);
      return [
        {
          name: node.context,
          status,
          conclusion,
          detailsUrl: node.targetUrl ?? "",
          event: null,
          runId: null,
        },
      ];
    }
    return [];
  });

  return {
    number: raw.number,
    state: raw.state as BatchPrData["state"],
    isDraft: raw.isDraft,
    mergeable: raw.mergeable as BatchPrData["mergeable"],
    mergeStateStatus: raw.mergeStateStatus as BatchPrData["mergeStateStatus"],
    reviewDecision: (raw.reviewDecision ?? null) as BatchPrData["reviewDecision"],
    headRefOid: raw.headRefOid,
    baseRefName: raw.baseRefName,
    reviewRequests,
    latestReviews,
    reviewThreads,
    comments,
    changesRequestedReviews,
    reviewSummaries,
    checks,
  };
}

function parseCreatedAt(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function extractRunId(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = /\/runs\/(\d+)/.exec(url);
  return m ? (m[1] ?? null) : null;
}

/** Maps a GitHub commit status `state` to CheckRun-compatible status + conclusion. */
function mapStatusContextState(state: string): {
  status: CheckStatus;
  conclusion: CheckConclusion;
} {
  switch (state) {
    case "SUCCESS":
      return { status: "COMPLETED", conclusion: "SUCCESS" };
    case "FAILURE":
    case "ERROR":
      return { status: "COMPLETED", conclusion: "FAILURE" };
    case "PENDING":
    case "EXPECTED":
    default:
      return { status: "IN_PROGRESS", conclusion: null };
  }
}

// ---------------------------------------------------------------------------
// Raw GraphQL response types (private to this module)
// ---------------------------------------------------------------------------

interface RawBatchResponse {
  repository: {
    pullRequest: RawPr | null;
  };
}

interface RawPr {
  number: number;
  state: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  headRefOid: string;
  baseRefName: string;
  reviewRequests: {
    nodes: Array<{
      requestedReviewer: { login?: string; name?: string } | null;
    }>;
  };
  latestReviews: {
    nodes: Array<{
      author: { login: string } | null;
      state: string;
    }>;
  };
  reviewThreads: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawThread[];
  };
  comments: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawComment[];
  };
  changesRequestedReviews: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawReview[];
  };
  reviewSummaries: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawReviewSummary[];
  };
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: {
          contexts: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: RawContextNode[];
          };
        } | null;
      };
    }>;
  };
}

interface RawThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  comments: {
    nodes: Array<{
      id: string;
      isMinimized: boolean;
      author: { login: string } | null;
      body: string;
      path: string | null;
      line: number | null;
      createdAt: string;
    }>;
  };
}

interface RawComment {
  id: string;
  isMinimized: boolean;
  author: { login: string } | null;
  body: string;
  createdAt: string;
}

interface RawReview {
  id: string;
  author: { login: string } | null;
  body: string;
}

interface RawReviewSummary {
  id: string;
  isMinimized: boolean;
  author: { login: string } | null;
  body: string;
}

type RawContextNode =
  | {
      __typename: "CheckRun";
      name: string;
      status: string;
      conclusion: string | null;
      detailsUrl: string | null;
      checkSuite: { workflowRun: { event: string } | null } | null;
    }
  | {
      __typename: "StatusContext";
      context: string;
      state: string;
      targetUrl: string | null;
    };
