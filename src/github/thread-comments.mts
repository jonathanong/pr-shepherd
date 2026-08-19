import { graphqlWithRateLimit } from "./client.mts";
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

export async function hydrateThreadCommentPages(threads: RawThread[]): Promise<RawThread[]> {
  return mapPool(threads, THREAD_COMMENT_PAGE_CONCURRENCY, (thread) =>
    hydrateThreadCommentPage(thread),
  );
}

async function hydrateThreadCommentPage(thread: RawThread): Promise<RawThread> {
  const pageInfo = thread.comments.pageInfo;
  if (!pageInfo?.hasNextPage || !pageInfo.endCursor) return thread;

  let rateLimitRemaining: number | undefined;
  const extra = await paginateForward<RawThreadComment>(async (cursor) => {
    if (rateLimitRemaining === 0) {
      throw new GitHubRequestError(
        "GitHub GraphQL rate limit remaining is 0; thread comment pagination incomplete",
        { status: 403 },
      );
    }
    const res = await graphqlWithRateLimit<RawReviewThreadCommentsResponse>(
      REVIEW_THREAD_COMMENTS_QUERY,
      {
        threadId: thread.id,
        ...(cursor ? { commentsCursor: cursor } : {}),
      },
    );
    rateLimitRemaining = res.rateLimit?.remaining;
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
