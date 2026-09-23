import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import type { RawCheckRollup, RawSummaryCommit, RawSummaryPr } from "./poll-summary-raw.mts";
import { POLL_SUMMARY_CHECK_PAGE_QUERY } from "./queries.mts";

type RawCheckContexts = RawCheckRollup["contexts"];

interface CheckPageResponse {
  repository: {
    object: {
      __typename: string;
      oid?: string;
      statusCheckRollup?: RawCheckRollup | null;
    } | null;
  } | null;
}

/**
 * Complete the compact summary's `last: 100` status-context windows in place.
 *
 * Without this, a PR with more than 100 contexts always reports incomplete
 * checks, so it can never earn or match a READY receipt. Every summary fetch
 * path runs this before anything fingerprints `commits`, so one-PR receipts and
 * aggregate stack reads hash the same evidence. A window that cannot be
 * completed stays incomplete, which already fails readiness closed.
 */
export async function hydratePollSummaryChecks(raw: RawSummaryPr, repo: RepoInfo): Promise<void> {
  const headCommit = raw.commits.nodes[0]?.commit;
  if (headCommit) await hydrateCommitContexts(headCommit, repo);
  const queueCommit = raw.mergeQueueEntry?.headCommit;
  if (queueCommit) await hydrateCommitContexts(queueCommit, repo);
}

async function hydrateCommitContexts(commit: RawSummaryCommit, repo: RepoInfo): Promise<void> {
  const contexts = commit.statusCheckRollup?.contexts;
  if (!contexts) return;
  const nodes = [...contexts.nodes];
  let pageInfo = contexts.pageInfo;
  while (pageInfo.hasPreviousPage && pageInfo.startCursor) {
    const older = await fetchOlderContexts(commit.oid, pageInfo.startCursor, repo);
    if (!older) break;
    nodes.unshift(...older.nodes);
    pageInfo = older.pageInfo;
  }
  // A window that shifted between pages can repeat or skip contexts; the
  // first page's total is the snapshot the hydrated list must account for.
  const complete = !pageInfo.hasPreviousPage && nodes.length === contexts.totalCount;
  commit.statusCheckRollup = {
    contexts: {
      totalCount: contexts.totalCount,
      pageInfo: { hasPreviousPage: !complete },
      nodes,
    },
  };
}

async function fetchOlderContexts(
  oid: string,
  before: string,
  repo: RepoInfo,
): Promise<RawCheckContexts | null> {
  const { data } = await graphqlWithRateLimit<CheckPageResponse>(POLL_SUMMARY_CHECK_PAGE_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    oid,
    before,
  });
  const object = data.repository?.object;
  if (object?.__typename !== "Commit" || object.oid !== oid) return null;
  return object.statusCheckRollup?.contexts ?? null;
}
