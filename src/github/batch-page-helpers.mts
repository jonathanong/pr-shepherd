import { requireContextNodes } from "./batch-response.mts";
import type {
  RawContextNode,
  RawComment,
  RawPr,
  RawReview,
  RawReviewSummary,
  RawThread,
} from "./batch-raw-types.mts";

export interface RawPageResponse {
  repository: {
    pullRequest: {
      reviewThreads?: RawPr["reviewThreads"];
      comments?: RawPr["comments"];
      changesRequestedReviews?: RawPr["changesRequestedReviews"];
      reviewSummaries?: RawPr["reviewSummaries"];
      approvedReviews?: RawPr["approvedReviews"];
      commits?: RawPr["commits"];
    } | null;
  };
}

interface RawConnection<T> {
  pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
  nodes: T[];
}

export function backwardCursor(
  conn: { pageInfo: { hasPreviousPage: boolean; startCursor: string | null } } | undefined,
): string | undefined {
  if (conn?.pageInfo.hasPreviousPage === true && conn.pageInfo.startCursor) {
    return conn.pageInfo.startCursor;
  }
  return undefined;
}

export function forwardCursor(
  conn: { pageInfo: { hasNextPage: boolean; endCursor: string | null } } | undefined,
): string | undefined {
  if (conn?.pageInfo.hasNextPage === true && conn.pageInfo.endCursor) {
    return conn.pageInfo.endCursor;
  }
  return undefined;
}

function prependConnection<T>(dest: T[], conn: RawConnection<T> | undefined, pr: number): void {
  if (!conn) throw new Error(`PR #${pr} not found`);
  dest.unshift(...conn.nodes);
}

function takeCheckPage(
  pr2: NonNullable<RawPageResponse["repository"]["pullRequest"]>,
  firstOid: string | undefined,
  pageCount: number,
): { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RawContextNode[] } {
  if (!pr2.commits?.nodes[0]?.commit.statusCheckRollup) {
    throw new Error(
      `Check-context pagination interrupted: statusCheckRollup disappeared on page ${pageCount + 1} (possible force-push race). Retry after the push stabilizes.`,
    );
  }
  const currentOid = pr2.commits.nodes[0]?.commit.oid;
  if (firstOid !== undefined && currentOid !== undefined && currentOid !== firstOid) {
    throw new Error(
      `Check-context pagination interrupted: head commit changed from ${firstOid} to ${currentOid} between pages (force-push race). Retry.`,
    );
  }
  const ctxs = pr2.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  if (!ctxs) {
    return { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] };
  }
  return { ...ctxs, nodes: requireContextNodes(ctxs.nodes) };
}

export interface PageCursors {
  threads?: string;
  comments?: string;
  changesRequested?: string;
  reviewSummaries?: string;
  approvedReviews?: string;
  checks?: string;
}

export interface PageAccumulator {
  threads: RawThread[];
  comments: RawComment[];
  changesRequested: RawReview[];
  reviewSummaries: RawReviewSummary[];
  approvedReviews: RawReviewSummary[];
  checks: RawContextNode[];
}

export function applyIncludedPage(
  dest: PageAccumulator,
  pr2: NonNullable<RawPageResponse["repository"]["pullRequest"]>,
  cursors: PageCursors,
  firstOid: string | undefined,
  pageCount: number,
  pr: number,
): { cursors: PageCursors; pageCount: number } {
  const next: PageCursors = {};
  let nextPageCount = pageCount;
  if (cursors.threads !== undefined) {
    prependConnection(dest.threads, pr2.reviewThreads, pr);
    next.threads = backwardCursor(pr2.reviewThreads);
  }
  if (cursors.comments !== undefined) {
    prependConnection(dest.comments, pr2.comments, pr);
    next.comments = backwardCursor(pr2.comments);
  }
  if (cursors.changesRequested !== undefined) {
    prependConnection(dest.changesRequested, pr2.changesRequestedReviews, pr);
    next.changesRequested = backwardCursor(pr2.changesRequestedReviews);
  }
  if (cursors.reviewSummaries !== undefined) {
    prependConnection(dest.reviewSummaries, pr2.reviewSummaries, pr);
    next.reviewSummaries = backwardCursor(pr2.reviewSummaries);
  }
  if (cursors.approvedReviews !== undefined) {
    prependConnection(dest.approvedReviews, pr2.approvedReviews, pr);
    next.approvedReviews = backwardCursor(pr2.approvedReviews);
  }
  if (cursors.checks !== undefined) {
    nextPageCount++;
    const extra = takeCheckPage(pr2, firstOid, nextPageCount);
    dest.checks.push(...extra.nodes);
    next.checks = forwardCursor(extra);
  }
  return { cursors: next, pageCount: nextPageCount };
}
