import { requireContextNodes } from "./batch-response.mts";
import type { RawContextNode, RawPr } from "./batch-raw-types.mts";

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

export function prependConnection<T>(
  dest: T[],
  conn: RawConnection<T> | undefined,
  pr: number,
): void {
  if (!conn) throw new Error(`PR #${pr} not found`);
  dest.unshift(...conn.nodes);
}

export function takeCheckPage(
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
