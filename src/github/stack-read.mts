import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { PollSummaryStackAncestry } from "../types.mts";
import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { missingRepositoryError } from "./errors.mts";
import { POLL_STACK_TOPOLOGY_QUERY } from "./queries.mts";

/** GitHub's `first` ceiling for one native-stack entries page. */
export const MAX_STACK_ENTRIES_PER_PAGE = 50;

/** Fields every native-stack read needs to validate membership and adjacent ancestry. */
export interface StackMemberRefs {
  number: number;
  state: string;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  baseRefOid: string;
}

interface RawStackResponse<Pr> {
  repository: {
    viewerCanAdminister: boolean;
    pullRequest: {
      stack: {
        id: string;
        number: number;
        size: number;
        baseRefName: string;
        entries: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{ position: number; pullRequest: Pr | null }>;
        };
      } | null;
    } | null;
  } | null;
}

/** One complete, validated native-stack membership read. */
export interface StackRead<Pr extends StackMemberRefs> {
  stackNumber: number;
  stackSize: number;
  viewerCanAdminister: boolean;
  /** Every member, bottom-to-top, each observed in the same paged read. */
  ordered: Pr[];
}

/**
 * Page through one native stack and fail closed on anything short of the full
 * membership: a missing repository, PR, or stack; a changed stack identity; a
 * null entry; a page without a cursor; or fewer unique members than `size`.
 */
export async function readStack<Pr extends StackMemberRefs>(
  query: string,
  anchor: number,
  repo: RepoInfo,
  variables: Record<string, unknown> = {},
): Promise<StackRead<Pr>> {
  let after: string | null = null;
  let stackId: string | null = null;
  let stackNumber = 0;
  let stackSize = 0;
  let viewerCanAdminister = false;
  const entries: Array<{ position: number; pullRequest: Pr }> = [];
  do {
    const response: { data: RawStackResponse<Pr> } = await graphqlWithRateLimit<
      RawStackResponse<Pr>
    >(query, { owner: repo.owner, repo: repo.name, anchor, after, ...variables });
    const repository = response.data.repository;
    if (!repository) throw missingRepositoryError(repo);
    viewerCanAdminister = repository.viewerCanAdminister;
    if (!repository.pullRequest) {
      throw new ShepherdError(`PR #${anchor} not found`, EXIT.UNAVAILABLE);
    }
    const stack = repository.pullRequest.stack;
    if (!stack) {
      throw new ShepherdError(
        `PR #${anchor} is not part of a native GitHub stack`,
        EXIT.UNAVAILABLE,
      );
    }
    if (stackId !== null && stack.id !== stackId) {
      throw new ShepherdError(
        "GitHub stack membership changed while it was being fetched; retry",
        EXIT.TEMPFAIL,
      );
    }
    stackId = stack.id;
    stackNumber = stack.number;
    stackSize = stack.size;
    for (const entry of stack.entries.nodes) {
      if (!entry.pullRequest) {
        throw new ShepherdError(
          "GitHub returned an incomplete pull-request stack entry",
          EXIT.TEMPFAIL,
        );
      }
      entries.push({ position: entry.position, pullRequest: entry.pullRequest });
    }
    const pageInfo = stack.entries.pageInfo;
    if (pageInfo.hasNextPage && !pageInfo.endCursor) {
      throw new ShepherdError(
        "GitHub stack pagination did not include an end cursor",
        EXIT.TEMPFAIL,
      );
    }
    if (pageInfo.hasNextPage && pageInfo.endCursor === after) {
      throw new ShepherdError(
        "GitHub stack pagination returned a repeated end cursor",
        EXIT.TEMPFAIL,
      );
    }
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after !== null);

  const unique = new Map<number, { position: number; pullRequest: Pr }>();
  for (const entry of entries) unique.set(entry.pullRequest.number, entry);
  if (!unique.has(anchor) || unique.size !== stackSize) {
    throw new ShepherdError(
      `GitHub returned incomplete stack membership (${unique.size} of ${stackSize} entries)`,
      EXIT.TEMPFAIL,
    );
  }
  const ordered = [...unique.values()]
    .sort((left, right) => left.position - right.position)
    .map((entry) => entry.pullRequest);
  return { stackNumber, stackSize, viewerCanAdminister, ordered };
}

/** Membership and linking refs only — no per-PR CI or review hydration. */
export function readStackTopology(
  anchor: number,
  repo: RepoInfo,
): Promise<StackRead<StackMemberRefs>> {
  return readStack<StackMemberRefs>(POLL_STACK_TOPOLOGY_QUERY, anchor, repo);
}

/**
 * Adjacent entries, both open, whose child base no longer matches the parent
 * head. Both sides come from the same read, so each gap was observed together.
 */
export function stackAncestryGaps(ordered: StackMemberRefs[]): PollSummaryStackAncestry[] {
  const gaps: PollSummaryStackAncestry[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const parent = ordered[index - 1]!;
    const child = ordered[index]!;
    if (parent.state !== "OPEN" || child.state !== "OPEN") continue;
    if (child.baseRefName === parent.headRefName && child.baseRefOid === parent.headRefOid) {
      continue;
    }
    gaps.push({
      parentPr: parent.number,
      parentHeadRefName: parent.headRefName,
      parentHeadRefOid: parent.headRefOid,
      childPr: child.number,
      childBaseRefName: child.baseRefName,
      childBaseRefOid: child.baseRefOid,
    });
  }
  return gaps;
}
