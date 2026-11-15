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
    if (
      layers.some(
        (l) =>
          (l.state === "CLOSED" || l.state === "UNKNOWN") && stackPosition(l) < stackPosition(item),
      )
    )
      break;
    prefix.push(item);
  }
  return prefix;
}

/**
 * The open layers a merge scope covers, and the layer a merge would target. Both scopes cover
 * only owned open layers: `all` is every one, `through` those up to and including that PR. The
 * `through` target is that PR itself while it is open; once it is closed or gone there is no
 * target, so a merge never retargets to a lower layer.
 */
export function mergeScopeLayers(
  result: PollSummaryResult,
  scope: Exclude<StackMergeScope, { kind: "ready" }>,
): { inScope: PollSummaryItem[]; target?: PollSummaryItem } {
  const open = openLayers(result);
  if (scope.kind === "all") {
    const inScope = open.filter((item) => item.owned === true);
    return { inScope, target: inScope.at(-1) };
  }
  // A through PR that is not an open row of the stack covers nothing rather than everything.
  const row = result.prs.find((item) => item.pr === scope.pr);
  const target = row?.state === "OPEN" ? row : undefined;
  const limit = target ? stackPosition(target) : 0;
  const inScope = open.filter((item) => stackPosition(item) <= limit && item.owned === true);
  return { inScope, target };
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
 * Whole-stack ownership only: the first tick of a `--merge`, `--merge-ready` or `--merge-through`
 * request records the open owned in-scope layers; later ticks of that same request (same command
 * line, within the record's TTL) report any open in-scope layer that is not in that record. A
 * different command line is a new request and records afresh. The record is dropped once nothing
 * in scope is open. Explicitly listed PRs need no record.
 */
export async function stackAddedLayers(
  result: Pick<PollSummaryResult, "repo" | "selection" | "prs" | "stackAncestry">,
  scope: StackMergeScope | undefined,
  command: string,
): Promise<number[]> {
  if (!scope || result.selection.kind !== "stack" || result.selection.owned) return [];
  const [owner, repo] = result.repo.split("/") as [string, string];
  const key = { owner, repo, stack: result.selection.stackNumber, scope: scopeKey(scope) };
  const layers =
    scope.kind === "ready"
      ? openLayers(result as PollSummaryResult).filter((item) => item.owned === true)
      : mergeScopeLayers(result as PollSummaryResult, scope).inScope;
  const current = layers.map((item) => item.pr);
  if (current.length === 0) {
    await clearApprovedLayers(key);
    return [];
  }
  const approved = await readApprovedLayers(key, command);
  if (!approved) {
    await writeApprovedLayers(key, current, command);
    return [];
  }
  return current.filter((pr) => !approved.includes(pr));
}
