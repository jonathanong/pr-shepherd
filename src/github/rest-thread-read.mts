import type { RepoInfo } from "./client.mts";
import type { RawThread, RawThreadComment } from "./batch-raw-types.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { resolveRestIdentity, resolveRestThreadRoot, restThreadId } from "./rest-identities.mts";

/** Complete REST reply chain, keeping the caller's opaque thread ID. */
export async function readRestRawThread(
  id: string,
  repo?: RepoInfo,
  pr?: number,
): Promise<RawThread> {
  const identity = repo && pr ? { repo, pr } : await resolveRestIdentity(id, "thread");
  const root = await resolveRestThreadRoot(identity.repo, identity.pr, id);
  const feedback = await readRestFeedback(identity.pr, identity.repo);
  const thread = feedback.threads.find((thread) => thread.id === restThreadId(root));
  if (!thread) throw new Error(`Review thread ${id} is absent from the REST snapshot`);
  const comments: RawThreadComment[] = (thread.comments ?? []).map((comment) => ({
    id: comment.id,
    body: comment.body,
    url: comment.url,
    author: { login: comment.author, __typename: comment.authorType },
    ...(comment.viewerDidAuthor === true && { viewerDidAuthor: true as const }),
    ...(comment.authorAssociation && { authorAssociation: comment.authorAssociation }),
    ...(comment.reviewId && { pullRequestReview: { id: comment.reviewId } }),
    path: thread.path,
    line: thread.line,
    startLine: thread.startLine,
    ...(comment.createdAtUnix && {
      createdAt: new Date(comment.createdAtUnix * 1000).toISOString(),
    }),
  }));
  return {
    id,
    ...(thread.isResolved !== undefined && { isResolved: thread.isResolved }),
    ...(thread.isOutdated !== undefined && { isOutdated: thread.isOutdated }),
    path: thread.path,
    line: thread.line,
    startLine: thread.startLine,
    comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: comments },
  };
}
