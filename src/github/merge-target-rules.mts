import { EXIT, ShepherdError } from "../exit-codes.mts";
import { parseBranchRules } from "./batch-parsers-rules.mts";
import type { RawBaseRef } from "./batch-raw-rules.mts";
import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { missingRepositoryError } from "./errors.mts";
import { BASE_BEHIND_QUERY, REF_RULES_QUERY } from "./queries.mts";
import { readStackTopology } from "./stack-read.mts";

export interface MergeTargetStatus {
  contexts: string[];
  trunkBehindBy?: number;
  stackBottomPr?: number;
}

interface RefRulesData {
  repository: {
    ref: (RawBaseRef & { compare: { behindBy: number } | null }) | null;
  } | null;
}

interface BaseBehindData {
  repository: {
    ref: { compare: { behindBy: number } | null } | null;
  } | null;
}

/**
 * Required status contexts for the branch GitHub actually merges into.
 * A native stack uses the trunk ref, and `behindBy` is that trunk against the bottom open layer.
 */
export async function loadMergeTargetStatus(input: {
  owner: string;
  name: string;
  pr: number;
  baseRefName: string;
  headRefName: string;
  localContexts: readonly string[];
  stack?: { baseRefName: string } | null;
}): Promise<MergeTargetStatus> {
  const trunk = input.stack?.baseRefName;
  if (!trunk) return { contexts: [...input.localContexts] };

  let headRef = input.headRefName;
  let stackBottomPr = input.pr;
  if (trunk !== input.baseRefName) {
    const bottom = await bottomOpenLayer(input.pr, { owner: input.owner, name: input.name }, trunk);
    headRef = bottom.headRefName;
    stackBottomPr = bottom.number;
  }
  const loaded = await fetchRefRules(input.owner, input.name, `refs/heads/${trunk}`, headRef);
  return {
    contexts: loaded.contexts,
    ...(loaded.behindBy > 0 && { trunkBehindBy: loaded.behindBy }),
    stackBottomPr,
  };
}

async function bottomOpenLayer(
  pr: number,
  repo: RepoInfo,
  trunk: string,
): Promise<{ number: number; headRefName: string }> {
  const topology = await readStackTopology(pr, repo);
  const bottom = topology.ordered.find(
    (member) => member.state === "OPEN" && member.baseRefName === trunk,
  );
  if (!bottom) {
    throw new ShepherdError(
      `Native stack for PR #${pr} has no open layer based on ${trunk}`,
      EXIT.TEMPFAIL,
    );
  }
  return bottom;
}

/**
 * Commits on the PR base that `headRef` does not contain.
 * Pass the head commit OID. A fork's branch name can exist on the base
 * repository, or fail to resolve, and either result hides a real behind count.
 * `mergeStateStatus` stays `BLOCKED` when a conversation or an expected check
 * is also open, so this compare is the behind count that status hides.
 */
export async function loadBaseBehindBy(
  owner: string,
  name: string,
  baseRefName: string,
  headRef: string,
): Promise<number> {
  const qualifiedName = `refs/heads/${baseRefName}`;
  const { data } = await graphqlWithRateLimit<BaseBehindData>(BASE_BEHIND_QUERY, {
    owner,
    repo: name,
    qualifiedName,
    headRef,
  });
  if (!data.repository) throw missingRepositoryError({ owner, name });
  const ref = data.repository.ref;
  if (!ref) {
    throw new ShepherdError(
      `Branch ${qualifiedName} was not found in ${owner}/${name}`,
      EXIT.TEMPFAIL,
    );
  }
  return ref.compare?.behindBy ?? 0;
}

async function fetchRefRules(
  owner: string,
  name: string,
  qualifiedName: string,
  headRef: string,
): Promise<{ contexts: string[]; behindBy: number }> {
  const { data } = await graphqlWithRateLimit<RefRulesData>(REF_RULES_QUERY, {
    owner,
    repo: name,
    qualifiedName,
    headRef,
  });
  if (!data.repository) throw missingRepositoryError({ owner, name });
  const ref = data.repository.ref;
  if (!ref) {
    throw new ShepherdError(
      `Branch ${qualifiedName} was not found in ${owner}/${name}`,
      EXIT.TEMPFAIL,
    );
  }
  return {
    contexts: parseBranchRules(ref).requiredStatusCheckContexts,
    behindBy: ref.compare?.behindBy ?? 0,
  };
}
