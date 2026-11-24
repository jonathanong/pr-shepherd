import { githubOperation } from "./transport.mts";
import { readRestRawThread } from "./rest-thread-read.mts";
import { graphqlWithRateLimit, type RateLimitInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { paginateForward } from "./pagination.mts";
import { REVIEW_THREAD_COMMENTS_DATA_QUERY, REVIEW_THREAD_COMMENTS_QUERY } from "./queries.mts";
import { mapPool } from "../util/pool.mts";
import { dropNullNodes, type UnreadNodes } from "./null-nodes.mts";
import type {
  RawReviewThreadCommentsResponse,
  RawThread,
  RawThreadComment,
} from "./batch-raw-types.mts";

const THREAD_COMMENT_PAGE_CONCURRENCY = 4;

export interface ThreadPages {
  threads: RawThread[];
  rateLimit?: RateLimitInfo;
  /** Set when a thread was withheld because one of its comments came back null. */
  unreadNodes?: UnreadNodes;
}

interface ThreadGate {
  rateLimit?: RateLimitInfo;
  exhausted: boolean;
  error?: unknown;
}

async function hydrateGraphqlThreadCommentPages(
  threads: RawThread[],
  initialRateLimit?: RateLimitInfo,
  viewerFree = false,
): Promise<ThreadPages> {
  const gate: ThreadGate = {
    rateLimit: initialRateLimit,
    exhausted: initialRateLimit?.remaining === 0,
  };
  const hydrated = await mapPool(threads, THREAD_COMMENT_PAGE_CONCURRENCY, async (thread) => {
    if (gate.error !== undefined) return thread;
    try {
      return await hydrateThreadCommentPage(thread, gate, viewerFree);
    } catch (error) {
      gate.error ??= error;
      return thread;
    }
  });
  if (gate.error !== undefined) throw gate.error;
  // A thread with an unreadable comment is withheld whole: a partial transcript is not its own.
  const threadsRead = hydrated.filter((thread) => thread !== null);
  return {
    threads: threadsRead,
    rateLimit: gate.rateLimit,
    ...(threadsRead.length < hydrated.length && { unreadNodes: { feedback: true as const } }),
  };
}

async function hydrateThreadCommentPage(
  thread: RawThread,
  gate: ThreadGate,
  viewerFree: boolean,
): Promise<RawThread | null> {
  let unread = false;
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
      viewerFree ? REVIEW_THREAD_COMMENTS_DATA_QUERY : REVIEW_THREAD_COMMENTS_QUERY,
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
    unread ||= dropNullNodes(node) !== undefined;
    return node.comments;
  }, pageInfo.endCursor);
  if (unread) return null;

  return {
    ...thread,
    comments: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [...thread.comments.nodes, ...extra],
    },
  };
}

export function hydrateThreadCommentPages(
  threads: RawThread[],
  initialRateLimit?: RateLimitInfo,
  viewerFree = false,
): Promise<ThreadPages> {
  return githubOperation(
    "ReviewThreadComments",
    () => hydrateGraphqlThreadCommentPages(threads, initialRateLimit, viewerFree),
    async () => ({
      threads: await mapPool(threads, THREAD_COMMENT_PAGE_CONCURRENCY, async (thread) =>
        thread.comments.pageInfo?.hasNextPage ? readRestRawThread(thread.id) : thread,
      ),
      rateLimit: initialRateLimit,
    }),
  );
}
