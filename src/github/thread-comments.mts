import { graphql } from "./client.mts";
import { paginateForward } from "./pagination.mts";
import { REVIEW_THREAD_COMMENTS_QUERY } from "./queries.mts";
import type {
  RawReviewThreadCommentsResponse,
  RawThread,
  RawThreadComment,
} from "./batch-raw-types.mts";

export async function hydrateThreadCommentPages(threads: RawThread[]): Promise<RawThread[]> {
  const hydrated: RawThread[] = [];

  for (const thread of threads) {
    hydrated.push(await hydrateThreadCommentPage(thread));
  }

  return hydrated;
}

async function hydrateThreadCommentPage(thread: RawThread): Promise<RawThread> {
  const pageInfo = thread.comments.pageInfo;
  if (!pageInfo?.hasNextPage || !pageInfo.endCursor) return thread;

  const extra = await paginateForward<RawThreadComment>(async (cursor) => {
    const res = await graphql<RawReviewThreadCommentsResponse>(REVIEW_THREAD_COMMENTS_QUERY, {
      threadId: thread.id,
      ...(cursor ? { commentsCursor: cursor } : {}),
    });
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
