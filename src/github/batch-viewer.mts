import { graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { BATCH_PR_VIEWER_QUERY } from "./queries.mts";
import type { RawComment, RawPr, RawReviewSummary, RawThread } from "./batch-raw-types.mts";

const NODES_PER_REQUEST = 100; // GraphQL `nodes(ids:)` limit

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

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += NODES_PER_REQUEST) {
    out.push(items.slice(i, i + NODES_PER_REQUEST));
  }
  return out;
}

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
  let viewer: BatchViewer | undefined;
  for (const batch of chunks(ids)) {
    const res = await graphqlWithRateLimit<ViewerResponse>(BATCH_PR_VIEWER_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      ids: batch,
    });
    if (!res.data.repository) {
      throw new Error(`GitHub viewer read did not include repository ${repo.owner}/${repo.name}`);
    }
    for (const node of res.data.nodes) if (node?.id) nodes.set(node.id, node);
    viewer = {
      login: res.data.viewer?.login ?? null,
      repository: res.data.repository,
      ...(res.rateLimit && { rateLimit: res.rateLimit }),
    };
  }
  const login = viewer!.login?.toLowerCase();
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
        login !== undefined && comment.author?.login.toLowerCase() === login;
    }
  }
  for (const item of [...targets.comments, ...targets.reviews]) {
    item.viewerCanMinimize = nodes.get(item.id)?.viewerCanMinimize === true;
  }
  return viewer!;
}
