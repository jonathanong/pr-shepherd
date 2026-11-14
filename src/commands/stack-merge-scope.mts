import {
  clearApprovedLayers,
  readApprovedLayers,
  writeApprovedLayers,
} from "../state/stack-merge-approval.mts";
import type { PollSummaryItem, PollSummaryResult, StackMergeScope } from "../types.mts";
import { stackLayerBlockReason } from "./stack-layer-readiness.mts";

/** The scope a caller's options request: an explicit one, or `all` for a bare merge. */
export function requestedMergeScope(opts: {
  merge?: boolean;
  stackMerge?: StackMergeScope;
}): StackMergeScope | undefined {
  return opts.stackMerge ?? (opts.merge ? { kind: "all" } : undefined);
}

export type StackLayer = PollSummaryItem & { stack: NonNullable<PollSummaryItem["stack"]> };

export function isStackLayerReady(item: PollSummaryItem): boolean {
  return item.stack !== undefined && stackLayerBlockReason(item) === undefined;
}

export function stackPosition(item: PollSummaryItem): number {
  return item.stack?.position ?? Number.MAX_SAFE_INTEGER;
}

function isStackLayer(item: PollSummaryItem): item is StackLayer {
  return item.stack !== undefined;
}

export function openLayers(result: PollSummaryResult): PollSummaryItem[] {
  return result.prs
    .filter((item) => item.state === "OPEN")
    .sort((left, right) => stackPosition(left) - stackPosition(right));
}

/**
 * The contiguous open layers from the bottom that a merge command could land now: each is ready,
 * has no stale ancestry, and no closed layer sits below it. `ownedOnly` ends the prefix at the
 * first layer the caller does not own.
 */
export function readyPrefix(result: PollSummaryResult, ownedOnly: boolean): StackLayer[] {
  const layers = [...result.prs].sort((left, right) => stackPosition(left) - stackPosition(right));
  if (layers.some((item) => item.state === "OPEN" && item.isInMergeQueue)) return [];
  const open = openLayers(result);
  const bottom = open[0];
  if (!bottom || !isStackLayer(bottom) || bottom.baseRefName !== bottom.stack.baseRefName) {
    return [];
  }
  const stale = new Set((result.stackAncestry ?? []).map((gap) => gap.childPr));
  const prefix: StackLayer[] = [];
  for (const item of open) {
    if (!isStackLayer(item)) break;
    if (item.action === "escalate" || !isStackLayerReady(item) || stale.has(item.pr)) break;
    if (ownedOnly && !item.owned) break;
    if (layers.some((l) => l.state === "CLOSED" && stackPosition(l) < stackPosition(item))) break;
    prefix.push(item);
  }
  return prefix;
}

/**
 * The open layers a merge scope covers, and the layer a merge would target. `all` is every owned
 * open layer; `through` is every open layer up to and including that PR.
 */
export function mergeScopeLayers(
  result: PollSummaryResult,
  scope: Exclude<StackMergeScope, { kind: "ready" }>,
): { inScope: PollSummaryItem[]; target?: PollSummaryItem } {
  const open = openLayers(result);
  // A through PR that is not a row of the stack covers nothing rather than everything.
  const target =
    scope.kind === "through" ? result.prs.find((item) => item.pr === scope.pr) : undefined;
  const limit = scope.kind === "all" ? Number.MAX_SAFE_INTEGER : target ? stackPosition(target) : 0;
  const inScope = open.filter(
    (item) => stackPosition(item) <= limit && (scope.kind === "through" || item.owned === true),
  );
  return { inScope, target: inScope.at(-1) };
}

/** PRs above a `--merge-through` target: outside the request, so they never get a session. */
export function aboveThroughTarget(
  result: PollSummaryResult,
  scope: StackMergeScope | undefined,
): Set<number> {
  if (scope?.kind !== "through") return new Set();
  const target = result.prs.find((item) => item.pr === scope.pr);
  const limit = target ? stackPosition(target) : 0;
  return new Set(result.prs.filter((item) => stackPosition(item) > limit).map((item) => item.pr));
}

/** In-scope layers closed without merging: the request is not complete while any exists. */
export function closedInScope(
  result: PollSummaryResult,
  scope: StackMergeScope,
): PollSummaryItem[] {
  const outside = aboveThroughTarget(result, scope);
  return result.prs.filter(
    (item) =>
      item.state === "CLOSED" &&
      (scope.kind === "through" ? !outside.has(item.pr) : item.owned === true),
  );
}

/** The scope's key in the approval record. */
function scopeKey(scope: StackMergeScope): string {
  return scope.kind === "through" ? `through-${scope.pr}` : scope.kind;
}

/**
 * Whole-stack ownership only: the first tick of a `--merge` or `--merge-through` request records
 * the open in-scope layers; later ticks report any open in-scope layer that is not in that record.
 * The record is dropped once nothing in scope is open. Explicitly listed PRs need no record.
 */
export async function stackAddedLayers(
  result: Pick<PollSummaryResult, "repo" | "selection" | "prs" | "stackAncestry">,
  scope: StackMergeScope | undefined,
): Promise<number[]> {
  if (!scope || scope.kind === "ready" || result.selection.kind !== "stack") return [];
  if (result.selection.owned) return [];
  const [owner, repo] = result.repo.split("/") as [string, string];
  const key = { owner, repo, stack: result.selection.stackNumber, scope: scopeKey(scope) };
  const { inScope } = mergeScopeLayers(result as PollSummaryResult, scope);
  const current = inScope.map((item) => item.pr);
  if (current.length === 0) {
    await clearApprovedLayers(key);
    return [];
  }
  const approved = await readApprovedLayers(key);
  if (!approved) {
    await writeApprovedLayers(key, current);
    return [];
  }
  return current.filter((pr) => !approved.includes(pr));
}
