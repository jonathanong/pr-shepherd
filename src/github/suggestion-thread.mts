import { graphql } from "./client.mts";
import { COMMIT_SUGGESTION_THREAD_QUERY } from "./queries.mts";
import { mapAuthorType, parseCreatedAt } from "./batch-parser-helpers.mts";
import type { ReviewThread } from "../types.mts";
import type { RepoInfo } from "./client.mts";
import type { RawThread } from "./batch-raw-types.mts";

export interface SuggestionThreadResult {
  headRefOid: string;
  headRefName: string;
  headRepoWithOwner: string | null;
  thread: ReviewThread | null;
}

interface RawSuggestionThread extends RawThread {
  pullRequest?: { number: number } | null;
}

interface RawSuggestionResponse {
  repository: {
    pullRequest: {
      headRefOid: string;
      headRefName: string;
      headRepository: { nameWithOwner: string } | null;
    } | null;
  };
  node: RawSuggestionThread | null;
}

export async function fetchSuggestionThread(
  pr: number,
  repo: RepoInfo,
  threadId: string,
): Promise<SuggestionThreadResult> {
  const result = await graphql<RawSuggestionResponse>(COMMIT_SUGGESTION_THREAD_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    pr,
    threadId,
  });
  const pull = result.data.repository.pullRequest;
  if (!pull) {
    throw new Error(`PR #${pr} not found`);
  }
  return {
    headRefOid: pull.headRefOid,
    headRefName: pull.headRefName,
    headRepoWithOwner: pull.headRepository?.nameWithOwner ?? null,
    thread: parseThread(result.data.node, pr, threadId),
  };
}

function parseThread(
  raw: RawSuggestionThread | null,
  pr: number,
  threadId: string,
): ReviewThread | null {
  if (!raw?.id || !raw.comments || raw.id !== threadId) return null;
  if (raw.pullRequest?.number !== pr) return null;
  const comment = raw.comments.nodes[0];
  return {
    id: raw.id,
    isResolved: raw.isResolved,
    isOutdated: raw.isOutdated,
    isMinimized: comment?.isMinimized ?? false,
    path: raw.path ?? comment?.path ?? null,
    line: raw.line ?? comment?.line ?? null,
    startLine: raw.startLine ?? comment?.startLine ?? null,
    author: comment?.author?.login ?? "unknown",
    authorType: mapAuthorType(comment?.author?.__typename, comment?.author?.login),
    ...(comment?.authorAssociation !== undefined && {
      authorAssociation: comment.authorAssociation,
    }),
    body: comment?.body ?? "",
    url: comment?.url ?? "",
    createdAtUnix: comment?.createdAt ? parseCreatedAt(comment.createdAt) : 0,
  };
}
