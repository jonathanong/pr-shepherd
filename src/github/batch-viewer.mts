import { graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { mapPool } from "../util/pool.mts";
import { chunksOf } from "../util/chunks.mts";
import { BATCH_PR_VIEWER_QUERY } from "./queries.mts";
import type { RawComment, RawPr, RawReviewSummary, RawThread } from "./batch-raw-types.mts";

const NODES_PER_REQUEST = 100; // GraphQL `nodes(ids:)` limit
const CONCURRENCY = 4;

interface ViewerNode {
  id?: string;
  viewerDidAuthor?: boolean;
  viewerCanUpdate?: boolean;
  viewerCanEnableAutoMerge?: boolean;
  viewerCanEditFiles?: boolean;
  headRepository?: { viewerPermission?: string | null } | null;
  viewerCanReply?: boolean;
  viewerCanResolve?: boolean;
  viewerCanMinimize?: boolean;
}

interface ViewerResponse {
  viewer?: { login: string | null } | null;
  repository: { viewerPermission: string | null; viewerCanAdminister: boolean } | null;
  nodes: Array<ViewerNode | null>;
}

/** The nodes of a viewer-free `BatchPr` read whose viewer fields are still missing. */
export interface ViewerTargets {
  threads: RawThread[];
  comments: RawComment[];
  reviews: RawReviewSummary[];
}

export interface BatchViewer {
  login: string | null;
  repository: { viewerPermission: string | null; viewerCanAdminister: boolean };
  rateLimit?: RateLimitInfo;
}

/** A bot's GraphQL `Bot` author has no `[bot]` suffix, but its token's `viewer.login` does. */
const normalizeLogin = (login: string): string => login.toLowerCase().replace(/\[bot\]$/, "");

/**
 * Read the viewer-relative fields a viewer-free `BatchPr` read omitted, on the user's token, in
 * the same tick, and write them onto the raw nodes. A node GitHub did not return keeps its
 * fields unset, which the parser reads as "no" (fail closed). `viewerDidAuthor` on thread
 * comments is the viewer login compared with the comment author: one login per request instead
 * of one id per comment.
 */
export async function applyBatchViewer(
  repo: RepoInfo,
  raw: RawPr,
  targets: ViewerTargets,
): Promise<BatchViewer> {
  const ids = [
    raw.id,
    ...targets.threads.map((t) => t.id),
    ...targets.comments.map((c) => c.id),
    ...targets.reviews.map((r) => r.id),
  ];
  const nodes = new Map<string, ViewerNode>();
  // Only the first chunk selects `viewer` and the repository. `allowPartialData`: an id that no
  // longer resolves (a comment deleted since the data read) comes back null beside a NOT_FOUND
  // error, and its fields stay unset (fail closed) instead of failing the tick.
  const results = await mapPool(chunksOf(ids, NODES_PER_REQUEST), CONCURRENCY, (batch, index) =>
    graphqlWithRateLimit<ViewerResponse>(
      BATCH_PR_VIEWER_QUERY,
      { owner: repo.owner, repo: repo.name, ids: batch, includeViewer: index === 0 },
      { allowPartialData: true },
    ),
  );
  for (const res of results) {
    for (const node of res.data.nodes) if (node?.id) nodes.set(node.id, node);
  }
  const first = results[0]!;
  if (!first.data.repository) {
    throw new Error(`GitHub viewer read did not include repository ${repo.owner}/${repo.name}`);
  }
  const viewer: BatchViewer = {
    login: first.data.viewer?.login ?? null,
    repository: first.data.repository,
    ...(first.rateLimit && { rateLimit: first.rateLimit }),
  };
  const login = viewer.login === null ? undefined : normalizeLogin(viewer.login);
  const prNode = nodes.get(raw.id);
  raw.viewerDidAuthor = prNode?.viewerDidAuthor === true;
  raw.viewerCanUpdate = prNode?.viewerCanUpdate === true;
  raw.viewerCanEnableAutoMerge = prNode?.viewerCanEnableAutoMerge === true;
  raw.viewerCanEditFiles = prNode?.viewerCanEditFiles === true;
  if (raw.headRepository) {
    raw.headRepository.viewerPermission = prNode?.headRepository?.viewerPermission ?? null;
  }
  for (const thread of targets.threads) {
    const node = nodes.get(thread.id);
    thread.viewerCanReply = node?.viewerCanReply === true;
    thread.viewerCanResolve = node?.viewerCanResolve === true;
    for (const comment of thread.comments.nodes) {
      comment.viewerDidAuthor =
        login !== undefined &&
        comment.author?.login !== undefined &&
        normalizeLogin(comment.author.login) === login;
    }
  }
  for (const item of [...targets.comments, ...targets.reviews]) {
    item.viewerCanMinimize = nodes.get(item.id)?.viewerCanMinimize === true;
  }
  return viewer;
}
