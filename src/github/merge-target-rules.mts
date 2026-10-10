import { githubOperation } from "./transport.mts";
import { readRestBehind } from "./rest-check-read.mts";
import { readRestBranchRules } from "./rest-rules-read.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { parseBranchRules } from "./batch-parsers-rules.mts";
import type { RawBaseRef } from "./batch-raw-rules.mts";
import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { missingRepositoryError } from "./errors.mts";
import {
  cachedBaseBehind,
  storeBaseBehind,
  type BaseBehindCacheOptions,
} from "./base-behind-cache.mts";
import { BASE_BEHIND_QUERY, REF_RULES_QUERY } from "./queries.mts";
import { readStackTopology, verifiedBottomOpenLayer } from "./stack-read.mts";
import type { CheckExecutionContext } from "../commands/check-execution-context.mts";

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
    ref: {
      target?: { oid?: string } | null;
      compare: { behindBy: number } | null;
    } | null;
  } | null;
}

/**
 * Required status contexts for the branch GitHub actually merges into.
 * A native stack uses the trunk ref, and `behindBy` is that trunk against the bottom open layer.
 */
export async function loadMergeTargetStatus(
  input: {
    owner: string;
    name: string;
    pr: number;
    baseRefName: string;
    headRefName: string;
    localContexts: readonly string[];
    stack?: { baseRefName: string } | null;
  },
  context?: CheckExecutionContext,
): Promise<MergeTargetStatus> {
  const trunk = input.stack?.baseRefName;
  if (!trunk) return { contexts: [...input.localContexts] };

  let headRef = input.headRefName;
  let stackBottomPr = input.pr;
  if (trunk !== input.baseRefName) {
    const bottom = await bottomOpenLayer(
      input.pr,
      { owner: input.owner, name: input.name },
      context,
    );
    headRef = bottom.headRefOid;
    stackBottomPr = bottom.number;
  }
  const loaded = await loadRefRules(input.owner, input.name, `refs/heads/${trunk}`, headRef);
  return {
    contexts: loaded.contexts,
    ...(loaded.behindBy > 0 && { trunkBehindBy: loaded.behindBy }),
    stackBottomPr,
  };
}

async function bottomOpenLayer(
  pr: number,
  repo: RepoInfo,
  context?: CheckExecutionContext,
): Promise<{ number: number; headRefOid: string }> {
  const topology = await (context?.readStackTopology(pr, repo) ?? readStackTopology(pr, repo));
  // GitHub can retain a merged parent's branch as the lowest open layer's
  // base. Stack order, rather than retargeting, determines the review target.
  return verifiedBottomOpenLayer(topology.ordered, pr);
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
  cache?: BaseBehindCacheOptions,
): Promise<number> {
  const cached = await cachedBaseBehind(cache, headRef);
  if (cached !== undefined) return cached;
  return githubOperation(
    "BaseBehind",
    async () => {
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
      if (!ref.compare) return 0;
      await storeBaseBehind(cache, ref.target?.oid, headRef, ref.compare.behindBy);
      return ref.compare.behindBy;
    },
    () => readRestBehind({ owner, name }, baseRefName, headRef),
  );
}

export async function loadRefRules(
  owner: string,
  name: string,
  qualifiedName: string,
  headRef: string,
): Promise<{ contexts: string[]; behindBy: number }> {
  return githubOperation(
    "RefRules",
    async () => {
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
    },
    async () => {
      const rules = await readRestBranchRules(
        { owner, name },
        qualifiedName.replace(/^refs\/heads\//, ""),
      );
      if (rules.unavailable.length > 0)
        throw new ShepherdError(
          rules.unavailable.map((item) => item.reason).join("; "),
          EXIT.UNAVAILABLE,
        );
      return {
        contexts: parseBranchRules(rules.baseRef).requiredStatusCheckContexts,
        behindBy: await readRestBehind(
          { owner, name },
          qualifiedName.replace(/^refs\/heads\//, ""),
          headRef,
        ),
      };
    },
  );
}
