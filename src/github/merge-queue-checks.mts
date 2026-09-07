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

type QueueCommit = {
  oid: string;
  statusCheckRollup?: {
    contexts: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<RawContextNode | null>;
    };
  } | null;
};

type QueueContexts = NonNullable<NonNullable<QueueCommit["statusCheckRollup"]>["contexts"]>;

function omittedCursorError(oid: string): Error {
  return new Error(
    `Merge queue check pagination interrupted: GitHub omitted the next cursor for ${oid}. Retry.`,
  );
}

function nextPageCursor(contexts: QueueContexts, oid: string): string | undefined {
  if (!contexts.pageInfo.hasNextPage) return undefined;
  if (!contexts.pageInfo.endCursor) throw omittedCursorError(oid);
  return contexts.pageInfo.endCursor;
}

function initialQueueCursor(
  existing: QueueContexts | undefined,
  oid: string,
): string | null | undefined {
  if (!existing) return null;
  return nextPageCursor(existing, oid);
}

async function fetchQueuePage(
  oid: string,
  repo: RepoInfo,
  cursor: string | null,
): Promise<QueueContexts | null> {
  const result = await graphql<CommitContextsResponse>(COMMIT_CHECK_CONTEXTS_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    oid,
    ...(cursor !== null && { cursor }),
  });
  const object = result.data.repository?.object;
  if (object?.__typename !== "Commit" || object.oid !== oid) {
    throw new Error(
      `Merge queue check pagination interrupted: commit ${oid} disappeared or changed. Retry.`,
    );
  }
  return object.statusCheckRollup?.contexts ?? null;
}

async function hydrateCommitContexts(commit: QueueCommit, repo: RepoInfo): Promise<void> {
  const existing = commit.statusCheckRollup?.contexts;
  const nodes: RawContextNode[] = existing ? [...requireContextNodes(existing.nodes)] : [];
  let cursor = initialQueueCursor(existing, commit.oid);

  while (cursor !== undefined) {
    // eslint-disable-next-line no-await-in-loop
    const next = await fetchQueuePage(commit.oid, repo, cursor);
    if (!next) {
      if (cursor === null) {
        cursor = undefined;
        continue;
      }
      throw new Error(
        `Merge queue check pagination interrupted: statusCheckRollup disappeared for ${commit.oid}. Retry.`,
      );
    }
    nodes.push(...requireContextNodes(next.nodes));
    cursor = nextPageCursor(next, commit.oid);
  }

  commit.statusCheckRollup = {
    contexts: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
  };
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
