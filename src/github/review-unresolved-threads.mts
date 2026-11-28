import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { githubOperation, isCcrTransport } from "./transport.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { chunksOf } from "../util/chunks.mts";

const REVIEW_THREADS_QUERY = `query ReviewUnresolvedThreads($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
  _shepherdRateLimit: rateLimit { cost limit nodeCount remaining resetAt used }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes {
              pullRequestReview { id }
            }
          }
        }
      }
    }
  }
}`;

const THREAD_STATES_QUERY = `query ReviewThreadStates($ids: [ID!]!) {
  _shepherdRateLimit: rateLimit { cost limit nodeCount remaining resetAt used }
  nodes(ids: $ids) {
    ... on PullRequestReviewThread {
      id
      isResolved
    }
  }
}`;

interface ReviewThreadsPageResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          isResolved: boolean;
          comments: { nodes: Array<{ pullRequestReview: { id: string } | null } | null> };
        } | null>;
      };
    } | null;
  } | null;
}

interface ThreadStatesResponse {
  nodes: Array<{ id?: string; isResolved?: boolean } | null>;
}

/** True when a node ID identifies a GitHub PullRequestReview (next-gen `PRR_` or legacy base64). */
export function isReviewNodeId(id: string): boolean {
  if (id.startsWith("PRR_")) return true;
  if (id.length < 24 || !/^[A-Za-z0-9+/=]+$/.test(id)) return false;
  try {
    return Buffer.from(id, "base64").toString("utf8").includes("PullRequestReview");
  } catch {
    return false;
  }
}

/**
 * Re-check only the specific thread IDs that local state last saw as unresolved, in case a
 * reviewer or human resolved them outside `pr-shepherd`. Returns the subset still unresolved.
 */
export async function checkThreadsStillUnresolved(
  pr: number,
  repo: RepoInfo,
  threadIds: readonly string[],
): Promise<Set<string>> {
  const unique = [...new Set(threadIds)];
  const unresolved = new Set<string>();
  if (unique.length === 0) return unresolved;

  await githubOperation(
    "ReviewThreadStates",
    async () => {
      for (const batch of chunksOf(unique, 100)) {
        // eslint-disable-next-line no-await-in-loop
        const res: { data: ThreadStatesResponse } =
          await graphqlWithRateLimit<ThreadStatesResponse>(
            THREAD_STATES_QUERY,
            { ids: batch },
            { allowPartialData: true },
          );
        const byId = new Map(
          res.data.nodes.flatMap((node) => (node?.id ? [[node.id, node.isResolved] as const] : [])),
        );
        for (const id of batch) {
          if (byId.get(id) === false) unresolved.add(id);
        }
      }
    },
    async () => {
      if (!isCcrTransport()) return;
      const wanted = new Set(unique);
      const feedback = await readRestFeedback(pr, repo);
      for (const thread of feedback.threads) {
        if (wanted.has(thread.id) && thread.isResolved === false) unresolved.add(thread.id);
      }
    },
  );

  return unresolved;
}

/**
 * Cold-cache fallback when no local `unresolvedInlineThreadIds` record exists for a review:
 * scan the PR's review threads and return `reviewId -> unresolvedThreadIds[]`.
 */
export async function findUnresolvedThreadsByReviewId(
  pr: number,
  repo: RepoInfo,
  reviewIds: readonly string[],
): Promise<Map<string, string[]>> {
  const wanted = new Set(reviewIds);
  const blocked = new Map<string, string[]>();
  if (wanted.size === 0) return blocked;

  const record = (reviewId: string | undefined, threadId: string): void => {
    if (!reviewId || !wanted.has(reviewId)) return;
    const list = blocked.get(reviewId) ?? [];
    if (!list.includes(threadId)) list.push(threadId);
    blocked.set(reviewId, list);
  };

  await githubOperation(
    "ReviewUnresolvedThreads",
    async () => {
      let cursor: string | null = null;
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const res: { data: ReviewThreadsPageResponse } =
          await graphqlWithRateLimit<ReviewThreadsPageResponse>(REVIEW_THREADS_QUERY, {
            owner: repo.owner,
            repo: repo.name,
            pr,
            cursor,
          });
        const connection = res.data.repository?.pullRequest?.reviewThreads;
        if (!connection) break;
        for (const thread of connection.nodes) {
          if (!thread || thread.isResolved !== false) continue;
          const reviewId = thread.comments.nodes[0]?.pullRequestReview?.id;
          record(reviewId, thread.id);
        }
        if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
        cursor = connection.pageInfo.endCursor;
      }
    },
    async () => {
      if (!isCcrTransport()) return;
      const feedback = await readRestFeedback(pr, repo);
      for (const thread of feedback.threads) {
        if (thread.isResolved === false) record(thread.reviewId, thread.id);
      }
    },
  );

  return blocked;
}
