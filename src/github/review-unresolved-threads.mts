import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { githubOperation, isCcrTransport } from "./transport.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";

const QUERY = `query ReviewUnresolvedThreads($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
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
 * Return `reviewId -> unresolvedThreadIds[]` for every requested review ID that still has at
 * least one unresolved inline review thread on GitHub.
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
          await graphqlWithRateLimit<ReviewThreadsPageResponse>(QUERY, {
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
