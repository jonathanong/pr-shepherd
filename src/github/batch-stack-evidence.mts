import { parseBranchRules } from "./batch-parsers-rules.mts";
import type { RawBaseRef, RawPrMergeFields } from "./batch-raw-rules.mts";
import type { StackMemberRefs, StackRead } from "./stack-read.mts";
import { orderedStackMembers } from "./stack-order.mts";

/** Required contexts and live tip of a native stack's trunk, read in `BatchPr`. */
export interface TrunkRules {
  refName: string;
  contexts: string[];
  tipOid?: string;
}

/**
 * Stack reads that `BatchPr`'s first page already answered. Each part is present
 * only when complete; a caller falls back to the standalone query otherwise.
 */
export interface BatchStackEvidence {
  topology?: StackRead<StackMemberRefs>;
  trunk?: TrunkRules;
}

/** Validate the embedded stack selections of one `BatchPr` first page. */
export function stackEvidenceFromRaw(
  raw: RawPrMergeFields & { number: number; baseRefName: string },
  data: {
    viewer?: { login: string | null } | null;
    repository?: { viewerCanAdminister?: boolean } | null;
  },
): BatchStackEvidence | undefined {
  const stack = raw.stack;
  if (!stack) return undefined;
  const viewer = {
    login: data.viewer?.login ?? null,
    canAdminister: data.repository?.viewerCanAdminister,
  };
  const topology = embeddedTopology(stack, raw.number, viewer);
  const trunk = embeddedTrunkRules(stack, raw);
  if (!topology && !trunk) return undefined;
  return { ...(topology && { topology }), ...(trunk && { trunk }) };
}

function embeddedTopology(
  stack: NonNullable<RawPrMergeFields["stack"]>,
  anchor: number,
  viewer: { login: string | null; canAdminister?: boolean },
): StackRead<StackMemberRefs> | undefined {
  const entries = stack.entries;
  // Past one page, PollStackTopology reads the full membership instead.
  if (!entries || entries.pageInfo.hasNextPage) return undefined;
  const members: Array<{ position: number; pullRequest: StackMemberRefs }> = [];
  for (const node of entries.nodes) {
    if (!node?.pullRequest) return undefined;
    members.push({ position: node.position, pullRequest: node.pullRequest });
  }
  try {
    return {
      stackNumber: stack.number,
      stackSize: stack.size,
      viewerLogin: viewer.login,
      ...(viewer.canAdminister !== undefined && { viewerCanAdminister: viewer.canAdminister }),
      ordered: orderedStackMembers(members, anchor, stack.size),
    };
  } catch {
    return undefined;
  }
}

/**
 * The trunk's rules come from whichever ref in this page is the trunk itself:
 * this PR's own base for the bottom layer, otherwise the first entry's base.
 */
function embeddedTrunkRules(
  stack: NonNullable<RawPrMergeFields["stack"]>,
  raw: RawPrMergeFields & { baseRefName: string },
): TrunkRules | undefined {
  const trunk = stack.baseRefName;
  if (raw.baseRefName === trunk && raw.baseRef) return trunkRules(trunk, raw.baseRef);
  const bottom = stack.trunkEntry?.nodes[0]?.pullRequest;
  if (bottom?.baseRefName !== trunk || !bottom.baseRef) return undefined;
  return trunkRules(trunk, bottom.baseRef);
}

function trunkRules(refName: string, ref: RawBaseRef): TrunkRules {
  const tipOid = ref.target?.oid;
  return {
    refName,
    contexts: parseBranchRules(ref).requiredStatusCheckContexts,
    ...(tipOid && { tipOid }),
  };
}
