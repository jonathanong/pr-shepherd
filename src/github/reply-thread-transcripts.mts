import { graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { rateLimitKind } from "./rate-limit-kind.mts";
import { REPLY_THREAD_COMMENTS_QUERY, REPLY_THREAD_TRANSCRIPTS_QUERY } from "./queries.mts";
import { threadTranscriptBodies } from "../threads/transcript.mts";
import { mapPool } from "../util/pool.mts";

const IDS_PER_REQUEST = 20;
const CONCURRENCY = 4;
const MAX_COMMENT_PAGES = 100;

interface CommentPage {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: Array<{ body: string }>;
}

interface ThreadNode {
  __typename: string;
  id?: string;
  pullRequest?: { number: number; repository: { nameWithOwner: string } } | null;
  comments?: CommentPage;
}

interface FirstPageResponse {
  nodes: Array<ThreadNode | null>;
}

interface NextPageResponse {
  node: ThreadNode | null;
}

/** Best-effort transcript evidence; it never filters user-supplied mutation IDs. */
export async function fetchReplyThreadTranscripts(
  pr: number,
  repo: RepoInfo,
  requestedIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(requestedIds)];
  if (ids.length === 0) return new Map();
  const expectedRepo = `${repo.owner}/${repo.name}`.toLowerCase();
  const requested = new Set(ids);
  const chunks: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += IDS_PER_REQUEST) {
    chunks.push(ids.slice(offset, offset + IDS_PER_REQUEST));
  }
  let stopped = false;
  const firstPages = await mapPool(chunks, CONCURRENCY, async (chunk) => {
    if (stopped) return [];
    try {
      const result = await graphqlWithRateLimit<FirstPageResponse>(REPLY_THREAD_TRANSCRIPTS_QUERY, {
        ids: chunk,
      });
      if (result.rateLimit?.remaining === 0) stopped = true;
      return result.data.nodes.filter(
        (node): node is ThreadNode =>
          node?.__typename === "PullRequestReviewThread" &&
          node.id !== undefined &&
          requested.has(node.id) &&
          node.pullRequest?.number === pr &&
          node.pullRequest.repository.nameWithOwner.toLowerCase() === expectedRepo &&
          node.comments !== undefined,
      );
    } catch (error) {
      if (isThrottle(error)) stopped = true;
      return [];
    }
  });
  const threads = firstPages.flat();
  const completed = await mapPool(threads, CONCURRENCY, async (thread) => {
    try {
      return await completeThread(
        thread,
        () => stopped,
        () => {
          stopped = true;
        },
      );
    } catch (error) {
      if (isThrottle(error)) stopped = true;
      return null;
    }
  });
  return new Map(completed.filter((entry): entry is [string, string] => entry !== null));
}

async function completeThread(
  thread: ThreadNode,
  isStopped: () => boolean,
  stop: () => void,
): Promise<[string, string] | null> {
  if (!thread.id || !thread.comments) return null;
  const bodies = thread.comments.nodes.map((comment) => comment.body);
  let page = thread.comments;
  const seenCursors = new Set<string>();
  let pages = 1;
  while (page.pageInfo.hasNextPage) {
    const cursor = page.pageInfo.endCursor;
    if (!cursor || seenCursors.has(cursor) || pages >= MAX_COMMENT_PAGES || isStopped())
      return null;
    seenCursors.add(cursor);
    const result: { data: NextPageResponse; rateLimit?: RateLimitInfo } =
      await graphqlWithRateLimit<NextPageResponse>(REPLY_THREAD_COMMENTS_QUERY, {
        id: thread.id,
        cursor,
      });
    if (result.rateLimit?.remaining === 0) stop();
    const next = result.data.node;
    if (next?.__typename !== "PullRequestReviewThread" || next.id !== thread.id || !next.comments) {
      return null;
    }
    page = next.comments;
    bodies.push(...page.nodes.map((comment) => comment.body));
    pages += 1;
  }
  return bodies.length > 0 ? [thread.id, threadTranscriptBodies(bodies)] : null;
}

function isThrottle(error: unknown): boolean {
  return error instanceof GitHubRequestError && rateLimitKind(error) !== null;
}
