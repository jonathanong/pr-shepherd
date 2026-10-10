import { githubOperation } from "./transport.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { readRestPull } from "./rest-pr-core.mts";
import { resolveRestThreadRoot, restThreadId } from "./rest-identities.mts";
import { graphql } from "./client.mts";
import { SUGGESTION_THREADS_QUERY } from "./queries.mts";
import { mapAuthorType, parseCreatedAt } from "./batch-parser-helpers.mts";
import type { ReviewThread } from "../types.mts";
import type { RepoInfo } from "./client.mts";
import type { RawThread } from "./batch-raw-types.mts";

export interface SuggestionThreadsResult {
  headRefOid: string;
  headRefName: string;
  headRepoWithOwner: string | null;
  threads: (ReviewThread | null)[];
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
  nodes: (RawSuggestionThread | null)[];
}

async function fetchGraphqlSuggestionThreads(
  pr: number,
  repo: RepoInfo,
  threadIds: readonly string[],
): Promise<SuggestionThreadsResult> {
  const result = await graphql<RawSuggestionResponse>(SUGGESTION_THREADS_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    pr,
    threadIds,
  });
  const pull = result.data.repository.pullRequest;
  if (!pull) {
    throw new Error(`PR #${pr} not found`);
  }
  return {
    headRefOid: pull.headRefOid,
    headRefName: pull.headRefName,
    headRepoWithOwner: pull.headRepository?.nameWithOwner ?? null,
    threads: threadIds.map((threadId) => {
      const raw = result.data.nodes.find((candidate) => candidate?.id === threadId) ?? null;
      return parseThread(raw, pr, threadId);
    }),
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
    ...(comment?.viewerDidAuthor === true && { viewerDidAuthor: true as const }),
    body: comment?.body ?? "",
    url: comment?.url ?? "",
    createdAtUnix: comment?.createdAt ? parseCreatedAt(comment.createdAt) : 0,
  };
}

export function fetchSuggestionThreads(
  pr: number,
  repo: RepoInfo,
  threadIds: readonly string[],
): Promise<SuggestionThreadsResult> {
  return githubOperation(
    "SuggestionThreads",
    () => fetchGraphqlSuggestionThreads(pr, repo, threadIds),
    async () => {
      const pull = await readRestPull(pr, repo);
      const feedback = await readRestFeedback(pr, repo);
      const threads = await Promise.all(
        threadIds.map(async (id) => {
          try {
            const root = await resolveRestThreadRoot(repo, pr, id);
            const found = feedback.threads.find((thread) => thread.id === restThreadId(root));
            return found ? { ...found, id } : null;
          } catch {
            return null;
          }
        }),
      );
      return {
        headRefOid: pull.head.sha,
        headRefName: pull.head.ref,
        headRepoWithOwner: pull.head.repo?.full_name ?? null,
        threads,
      };
    },
  );
}
