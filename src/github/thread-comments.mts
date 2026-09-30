import { graphqlWithRateLimit, type RateLimitInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { paginateForward } from "./pagination.mts";
import { REVIEW_THREAD_COMMENTS_QUERY } from "./queries.mts";
import { mapPool } from "../util/pool.mts";
import type {
  RawReviewThreadCommentsResponse,
  RawThread,
  RawThreadComment,
} from "./batch-raw-types.mts";

const THREAD_COMMENT_PAGE_CONCURRENCY = 4;

export async function hydrateThreadCommentPages(
  threads: RawThread[],
  initialRateLimit?: RateLimitInfo,
): Promise<{ threads: RawThread[]; rateLimit?: RateLimitInfo }> {
  const gate: { rateLimit?: RateLimitInfo; exhausted: boolean; error?: unknown } = {
    rateLimit: initialRateLimit,
    exhausted: initialRateLimit?.remaining === 0,
  };
  const hydrated = await mapPool(threads, THREAD_COMMENT_PAGE_CONCURRENCY, async (thread) => {
    if (gate.error !== undefined) return thread;
    try {
      return await hydrateThreadCommentPage(thread, gate);
    } catch (error) {
      gate.error ??= error;
      return thread;
    }
  });
  if (gate.error !== undefined) throw gate.error;
  return { threads: hydrated, rateLimit: gate.rateLimit };
}

async function hydrateThreadCommentPage(
  thread: RawThread,
  gate: { rateLimit?: RateLimitInfo; exhausted: boolean; error?: unknown },
): Promise<RawThread> {
  const pageInfo = thread.comments.pageInfo;
  if (!pageInfo?.hasNextPage || !pageInfo.endCursor) return thread;

  const extra = await paginateForward<RawThreadComment>(async (cursor) => {
    if (gate.error !== undefined) throw gate.error;
    if (gate.exhausted) {
      throw new GitHubRequestError(
        "GitHub GraphQL rate limit remaining is 0; thread comment pagination incomplete",
        { status: 403, rateLimit: gate.rateLimit },
      );
    }
    const res = await graphqlWithRateLimit<RawReviewThreadCommentsResponse>(
      REVIEW_THREAD_COMMENTS_QUERY,
      {
        threadId: thread.id,
        ...(cursor ? { commentsCursor: cursor } : {}),
      },
    );
    if (res.rateLimit?.remaining === 0) {
      gate.rateLimit = res.rateLimit;
      gate.exhausted = true;
    } else if (!gate.exhausted) {
      gate.rateLimit = res.rateLimit ?? gate.rateLimit;
    }
    const node = res.data.node;
    if (!node?.comments) {
      const nodeType = node?.__typename ?? "null";
      throw new Error(
        `Review thread ${thread.id} did not resolve to PullRequestReviewThread while paginating comments (node type: ${nodeType})`,
      );
    }
    return node.comments;
  }, pageInfo.endCursor);

  return {
    ...thread,
    comments: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [...thread.comments.nodes, ...extra],
    },
  };
}
