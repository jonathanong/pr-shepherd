import { graphql } from "./client.mts";
import { requireContextNodes } from "./batch-response.mts";
import { COMMIT_CHECK_CONTEXTS_QUERY } from "./queries.mts";
import type { RepoInfo } from "./client.mts";
import type { RawContextNode, RawPr } from "./batch-raw-types.mts";

interface CommitContextsResponse {
  repository: {
    object: {
      __typename: string;
      oid?: string;
      statusCheckRollup?: {
        contexts: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<RawContextNode | null>;
        };
      } | null;
    } | null;
  } | null;
}

type QueueCommit = NonNullable<NonNullable<RawPr["mergeQueueEntry"]>["headCommit"]>;

async function hydrateCommitContexts(commit: QueueCommit, repo: RepoInfo): Promise<void> {
  const contexts = commit.statusCheckRollup?.contexts;
  if (!contexts) return;
  contexts.nodes = requireContextNodes(contexts.nodes);
  if (contexts.pageInfo.hasNextPage && !contexts.pageInfo.endCursor) {
    throw new Error(
      `Merge queue check pagination interrupted: GitHub omitted the next cursor for ${commit.oid}. Retry.`,
    );
  }
  let cursor = contexts.pageInfo.hasNextPage ? contexts.pageInfo.endCursor : null;

  while (cursor) {
    // eslint-disable-next-line no-await-in-loop
    const result = await graphql<CommitContextsResponse>(COMMIT_CHECK_CONTEXTS_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      oid: commit.oid,
      cursor,
    });
    const object = result.data.repository?.object;
    if (object?.__typename !== "Commit" || object.oid !== commit.oid) {
      throw new Error(
        `Merge queue check pagination interrupted: commit ${commit.oid} disappeared or changed. Retry.`,
      );
    }
    const next = object.statusCheckRollup?.contexts;
    if (!next) {
      throw new Error(
        `Merge queue check pagination interrupted: statusCheckRollup disappeared for ${commit.oid}. Retry.`,
      );
    }
    contexts.nodes.push(...requireContextNodes(next.nodes));
    contexts.pageInfo = next.pageInfo;
    cursor = next.pageInfo.hasNextPage ? next.pageInfo.endCursor : null;
    if (next.pageInfo.hasNextPage && !cursor) {
      throw new Error(
        `Merge queue check pagination interrupted: GitHub omitted the next cursor for ${commit.oid}. Retry.`,
      );
    }
  }
}

/** Hydrate all status contexts for the active or most recently removed queue commit. */
export async function hydrateMergeQueueChecks(raw: RawPr, repo: RepoInfo): Promise<void> {
  const active = raw.mergeQueueEntry?.headCommit;
  const removal = raw.mergeQueueRemovals?.nodes[0];
  const addition = raw.mergeQueueAdditions?.nodes[0];
  const removalIsCurrent = Boolean(
    removal && (!addition || Date.parse(removal.createdAt) >= Date.parse(addition.createdAt)),
  );
  const removed = removalIsCurrent ? removal?.beforeCommit : undefined;
  if (active) await hydrateCommitContexts(active, repo);
  if (removed && removed.oid !== active?.oid) await hydrateCommitContexts(removed, repo);
}
