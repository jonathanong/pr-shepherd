import { loadBaseBehindBy } from "../github/merge-target-rules.mts";
import { pollRateLimitRetryAfterMs } from "./poll-quota.mts";
import type { PollSummaryItem, PollSummaryResult, StackMergeScope } from "../types.mts";
import { mergeScopeLayers, openLayers, readyPrefix } from "./stack-merge-scope.mts";

/**
 * The layer a stack merge would target, or undefined when none is ready to land. Mirrors the
 * choice `planStackMerge` makes: the highest ready owned layer for `ready`, otherwise the scope
 * target once it sits inside the ready prefix.
 */
function stackMergeTop(
  result: PollSummaryResult,
  scope: StackMergeScope,
): PollSummaryItem | undefined {
  if (openLayers(result).length === 0) return undefined;
  if (scope.kind === "ready") return readyPrefix(result, true).at(-1);
  const { target } = mergeScopeLayers(result, scope);
  return target && readyPrefix(result, false).some((item) => item.pr === target.pr)
    ? target
    : undefined;
}

/**
 * GitHub compares an upper layer's `mergeable` only with its parent layer, so a conflict with
 * trunk stays invisible until `gh stack merge` fails. Compare trunk with the top landing layer's
 * head once and record the result on that row: `trunkBehindBy` when trunk has commits the head
 * lacks, `trunkBehindUnknown` when the compare failed. A failure never blocks the merge; the
 * printed pre-check still runs, because a missed conflict costs a failed atomic merge.
 */
export async function withTrunkBehind(
  result: PollSummaryResult,
  scope: StackMergeScope | undefined,
): Promise<PollSummaryResult> {
  if (!scope || result.selection.kind !== "stack") return result;
  const top = stackMergeTop(result, scope);
  const trunk = top?.stack?.baseRefName;
  if (!top || !trunk || top.baseRefName === trunk) return result;
  const [owner, name] = result.repo.split("/") as [string, string];
  let mark: Pick<PollSummaryItem, "trunkBehindBy" | "trunkBehindUnknown">;
  try {
    const behind = await loadBaseBehindBy(owner, name, trunk, top.headRefOid);
    if (behind <= 0) return result;
    mark = { trunkBehindBy: behind };
  } catch (err) {
    if (pollRateLimitRetryAfterMs(err) !== null) throw err;
    process.stderr.write(
      `pr-shepherd: trunk compare unavailable for PR #${top.pr} (ignored): ${err instanceof Error ? err.message : String(err)}\n`,
    );
    mark = { trunkBehindUnknown: true };
  }
  return {
    ...result,
    prs: result.prs.map((item) => (item.pr === top.pr ? { ...item, ...mark } : item)),
  };
}
