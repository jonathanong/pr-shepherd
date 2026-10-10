import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { githubOperation } from "./transport.mts";
import {
  recordThreadIdentity,
  resolveGraphqlThreadId,
  resolveRestThreadRoot,
} from "./rest-identities.mts";
import { readRest, readRestPages, restRepoPath } from "./rest-reader-core.mts";
import { mapPool } from "../util/pool.mts";

export interface ReplyEvidence {
  viewer: string;
  comments: Array<{ id: string; body: string; author: string | null }>;
}
interface Page {
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: Array<{ id: string; databaseId: number; body: string; author: { login: string } | null }>;
}
interface Node {
  id: string;
  pullRequest: { number: number; repository: { nameWithOwner: string } };
  comments: Page;
}
interface Response {
  viewer: { login: string };
  nodes: Array<Node | null>;
}
const QUERY = `query ReplyRecoveryEvidence($ids: [ID!]!, $cursor: String) {
  _shepherdRateLimit: rateLimit { cost limit nodeCount remaining resetAt used }
  viewer { login }
  nodes(ids: $ids) { ... on PullRequestReviewThread {
    id pullRequest { number repository { nameWithOwner } }
    comments(first: 100, after: $cursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { id databaseId body author { login } }
    }
  } }
}`;

/** Complete, bounded evidence for one mutation batch; unavailable evidence never certifies a retry. */
export async function readReplyRecoveryEvidence(
  repo: RepoInfo,
  pr: number,
  requestedIds: readonly string[],
): Promise<Map<string, ReplyEvidence>> {
  if (requestedIds.length === 0) return new Map();
  if (requestedIds.length > 10) throw new Error("Reply recovery batch exceeds 10 threads");
  return githubOperation(
    "ReplyRecoveryEvidence",
    async () => {
      const ids = await Promise.all(requestedIds.map(resolveGraphqlThreadId));
      const read = (pageIds: string[], cursor: string | null) =>
        graphqlWithRateLimit<Response>(QUERY, { ids: pageIds, cursor });
      const first = await read(ids, null);
      const viewer = first.data.viewer?.login;
      if (typeof viewer !== "string" || !viewer)
        throw new Error("Reply recovery viewer is unavailable");
      const entries = await mapPool(ids, 4, async (id, index) => {
        let node = first.data.nodes.find((item) => item?.id === id);
        const comments: ReplyEvidence["comments"] = [];
        const cursors = new Set<string>();
        const total = node?.comments?.totalCount;
        const root = node?.comments?.nodes?.[0]?.databaseId;
        const seenIds = new Set<string>();
        for (let page = 0; page < 100; page++) {
          if (
            !node ||
            node.pullRequest?.number !== pr ||
            node.pullRequest.repository.nameWithOwner.toLowerCase() !==
              `${repo.owner}/${repo.name}`.toLowerCase() ||
            !node.comments?.pageInfo ||
            typeof node.comments.pageInfo.hasNextPage !== "boolean" ||
            !Array.isArray(node.comments.nodes) ||
            !Number.isSafeInteger(total) ||
            total! < 1 ||
            node.comments.totalCount !== total
          )
            throw new Error("Reply recovery transcript is unavailable");
          if (page === 0) {
            if (!Number.isSafeInteger(root) || root! < 1)
              throw new Error("Reply recovery root identity is unavailable");
            await recordThreadIdentity(repo, pr, id, root!);
          }
          for (const comment of node.comments.nodes) {
            if (
              typeof comment.id !== "string" ||
              !comment.id ||
              seenIds.has(comment.id) ||
              typeof comment.body !== "string" ||
              (comment.author !== null && typeof comment.author?.login !== "string")
            )
              throw new Error("Reply recovery comment is incomplete");
            seenIds.add(comment.id);
            comments.push({
              id: comment.id,
              body: comment.body,
              author: comment.author?.login ?? null,
            });
          }
          if (!node.comments.pageInfo.hasNextPage && comments.length === total)
            return [requestedIds[index]!, { viewer, comments }] as const;
          if (!node.comments.pageInfo.hasNextPage) break;
          const cursor = node.comments.pageInfo.endCursor;
          if (!cursor || cursors.has(cursor)) break;
          cursors.add(cursor);
          const next = await read([id], cursor);
          if (next.data.viewer?.login !== viewer) throw new Error("Reply recovery viewer changed");
          node = next.data.nodes.find((item) => item?.id === id);
        }
        throw new Error("Reply recovery transcript pagination is incomplete");
      });
      return new Map(entries);
    },
    async () => {
      const viewer = await readRest<{ login?: string }>("GET", "/user");
      if (typeof viewer.login !== "string" || !viewer.login)
        throw new Error("Reply recovery viewer is unavailable");
      const inline = (
        await readRestPages<{
          id: number;
          node_id: string;
          body: string;
          in_reply_to_id?: number;
          user: { login: string } | null;
        }>(`${restRepoPath(repo)}/pulls/${pr}/comments`)
      ).nodes;
      const entries = await Promise.all(
        requestedIds.map(async (id) => {
          const root = await resolveRestThreadRoot(repo, pr, id);
          if (!inline.some((comment) => String(comment.id) === root))
            throw new Error("Reply recovery thread is unavailable");
          const comments = inline
            .filter(
              (comment) => String(comment.id) === root || String(comment.in_reply_to_id) === root,
            )
            .map((comment) => {
              if (
                typeof comment.node_id !== "string" ||
                !comment.node_id ||
                typeof comment.body !== "string" ||
                (comment.user !== null && typeof comment.user?.login !== "string")
              )
                throw new Error("Reply recovery comment is incomplete");
              return {
                id: comment.node_id,
                body: comment.body,
                author: comment.user?.login ?? null,
              };
            });
          return [id, { viewer: viewer.login!, comments }] as const;
        }),
      );
      return new Map(entries);
    },
  );
}
