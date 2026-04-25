/**
 * `shepherd status PR1 [PR2 PR3 …]`
 *
 * Fetches readiness status for one or more PRs and prints a table.
 * Uses a separate lightweight GraphQL query (MULTI_PR_STATUS_QUERY) per PR
 * rather than the heavy batch query, since we only need summary data.
 *
 * Exit code: 0 if all PRs are READY, non-zero otherwise.
 */

import { graphql, getRepoInfo } from "../github/client.mts";
import { MULTI_PR_STATUS_QUERY, MULTI_PR_STATUS_QUERY_WITH_CURSOR } from "../github/queries.mts";
import type { GlobalOptions } from "../types.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PrSummary {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  mergeStateStatus: string;
  reviewDecision: string | null;
  unresolvedThreads: number;
  ciState: string | null;
  /**
   * True when `reviewThreads` returned exactly 100 nodes but `totalCount` is higher —
   * meaning the unresolved-thread count may be undercounted.
   */
  threadsTruncated: boolean;
}

export interface StatusCommandOptions extends GlobalOptions {
  prNumbers: number[];
}

export async function runStatus(opts: StatusCommandOptions): Promise<PrSummary[]> {
  const repo = await getRepoInfo();
  const summaries = await Promise.all(
    opts.prNumbers.map((pr) => fetchSummary(pr, repo.owner, repo.name)),
  );
  return summaries;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function fetchSummary(pr: number, owner: string, repo: string): Promise<PrSummary> {
  const result = await graphql<RawStatusResponse>(MULTI_PR_STATUS_QUERY, {
    owner,
    repo,
    pr,
  });

  const p = result.data.repository.pullRequest;
  if (!p) {
    throw new Error(`PR #${pr} not found in ${owner}/${repo}`);
  }

  let allNodes = p.reviewThreads.nodes;

  // If the response was truncated, fetch additional pages to get the full count.
  if (p.reviewThreads.totalCount > p.reviewThreads.nodes.length) {
    // Fetch additional pages backward until we have all threads.
    const MAX_THREAD_PAGES = 10;
    let pagesFetched = 0;
    const totalCount = p.reviewThreads.totalCount;
    let cursor: string | null = p.reviewThreads.pageInfo?.startCursor ?? null;
    while (cursor !== null) {
      if (++pagesFetched > MAX_THREAD_PAGES) {
        process.stderr.write(
          `pr-shepherd: thread pagination cap reached for PR #${pr}: fetched ${allNodes.length} of ${totalCount} threads\n`,
        );
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      const extra = await graphql<RawStatusResponse>(MULTI_PR_STATUS_QUERY_WITH_CURSOR, {
        owner,
        repo,
        pr,
        cursor,
      });
      const p2 = extra.data.repository.pullRequest;
      if (!p2) break;
      allNodes = [...p2.reviewThreads.nodes, ...allNodes];
      if (!p2.reviewThreads.pageInfo?.hasPreviousPage || !p2.reviewThreads.pageInfo.startCursor) {
        break;
      }
      cursor = p2.reviewThreads.pageInfo.startCursor;
    }
  }

  const unresolvedThreads = allNodes.filter((n) => !n.isResolved).length;
  const ciState = p.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;
  // If we still have fewer nodes than totalCount, report truncation.
  const threadsTruncated = p.reviewThreads.totalCount > allNodes.length;

  return {
    number: p.number,
    title: p.title,
    state: p.state,
    isDraft: p.isDraft,
    mergeStateStatus: p.mergeStateStatus,
    reviewDecision: p.reviewDecision,
    unresolvedThreads,
    ciState,
    threadsTruncated,
  };
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

export function formatStatusTable(summaries: PrSummary[], repoFull: string): string {
  const lines: string[] = [`\n# ${repoFull} — PR status (${summaries.length})\n`];

  for (const s of summaries) {
    const verdict = deriveVerdict(s);
    const ciLabel = s.ciState ?? "—";
    const title = s.title.slice(0, 50);
    const truncNote = s.threadsTruncated
      ? " (threads truncated — run shepherd check for full count)"
      : "";
    lines.push(
      `PR #${String(s.number).padEnd(5)} ${title.padEnd(52)} ${verdict.padEnd(12)} ${ciLabel}${truncNote}`,
    );
  }

  return lines.join("\n");
}

export function deriveVerdict(s: PrSummary): string {
  if (s.state === "MERGED") return "MERGED";
  if (s.state === "CLOSED") return "CLOSED";
  if (s.isDraft) return "DRAFT";
  if (
    s.mergeStateStatus === "CLEAN" &&
    s.unresolvedThreads === 0 &&
    s.ciState === "SUCCESS" &&
    s.reviewDecision !== "CHANGES_REQUESTED"
  ) {
    return "READY";
  }
  if (s.mergeStateStatus === "BLOCKED" || s.mergeStateStatus === "HAS_HOOKS") return "BLOCKED";
  if (s.mergeStateStatus === "DIRTY") return "CONFLICTS";
  if (s.ciState === "PENDING" || s.ciState === "EXPECTED") return "IN PROGRESS";
  if (s.ciState === "FAILURE" || s.ciState === "ERROR") return "FAILING";
  return s.mergeStateStatus;
}

// ---------------------------------------------------------------------------
// Raw GraphQL types
// ---------------------------------------------------------------------------

interface RawStatusResponse {
  repository: {
    pullRequest: {
      number: number;
      title: string;
      state: string;
      isDraft: boolean;
      mergeStateStatus: string;
      reviewDecision: string | null;
      reviewThreads: {
        totalCount: number;
        pageInfo?: { hasPreviousPage: boolean; startCursor: string | null };
        nodes: Array<{ isResolved: boolean }>;
      };
      commits: {
        nodes: Array<{
          commit: {
            statusCheckRollup: { state: string } | null;
          };
        }>;
      };
    } | null;
  };
}
