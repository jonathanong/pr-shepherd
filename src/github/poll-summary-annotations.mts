import { pollRateLimitRetryAfterMs } from "../commands/poll-quota.mts";
import type { PollSummaryChecks, PollSummaryItem } from "../types.mts";
import { fetchCheckRunAnnotationsBatch } from "./check-annotations-batch.mts";
import type { RepoInfo } from "./client.mts";
import { hydrateAnnotationTotals } from "./poll-summary-annotation-probe.mts";
import { classifiedSummaryChecks } from "./poll-summary-checks.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

type Routed = Pick<PollSummaryItem, "action" | "reasons">;

/** Routes whose action claims the row has nothing left to do. */
const READY_CLAIMS = new Set([
  "appears-ready",
  "draft-appears-ready",
  "already-in-merge-queue",
  "already-auto-merging",
]);

/**
 * The one-PR check treats unseen annotations on any non-SUCCESS check (failing, skipped,
 * filtered or neutral) as actionable work; `checks.ignore` checks never gate, annotations included. The compact summary only has annotation
 * totals, and only for a row that otherwise claims readiness, so it loads them then and reads
 * the annotations of just the non-SUCCESS checks that have any. A row with unseen annotations,
 * or whose annotations cannot be read, goes to its one-PR `pollCommand` instead of
 * claiming `appears-ready`, `cancel`, `mark_ready` or `merge`.
 */
export async function applyUnseenCheckAnnotations(
  raw: RawSummaryPr,
  repo: RepoInfo,
  routed: Routed,
  checks: PollSummaryChecks,
  seen: ReadonlyMap<string, unknown>,
  required: readonly string[],
): Promise<Routed> {
  if (!routed.reasons.some((reason) => READY_CLAIMS.has(reason))) return routed;
  // Successful checks never carry actionable annotations: skip the probe when none can.
  if (nonSuccessCheckTotals(raw, required, false).size === 0) return routed;
  const totalsKnown = await hydrateAnnotationTotals(raw, repo);
  const candidates = nonSuccessCheckTotals(raw, required, totalsKnown);
  if (candidates.size === 0) return routed;
  const count = totalsKnown
    ? await countChecksWithUnseen(raw, repo, candidates, seen)
    : candidates.size;
  if (count === 0) return routed;
  checks.annotated = count;
  return { action: "triage", reasons: ["check-annotations"] };
}

/** Completed, non-SUCCESS head checks with their annotation totals (all of them when totals are unknown). */
function nonSuccessCheckTotals(
  raw: RawSummaryPr,
  required: readonly string[],
  totalsKnown: boolean,
): Map<string, number> {
  const head = new Map(
    (raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []).flatMap((node) =>
      node.__typename === "CheckRun" && node.id
        ? [[node.id, node.annotations?.totalCount] as const]
        : [],
    ),
  );
  const totals = new Map<string, number>();
  for (const check of classifiedSummaryChecks(raw, required)) {
    if (check.scope || check.id == null || !head.has(check.id)) continue;
    if (["in_progress", "superseded", "ignored"].includes(check.category)) continue;
    if (check.status !== "COMPLETED" || check.conclusion === "SUCCESS") continue;
    const total = head.get(check.id) ?? 0;
    if (!totalsKnown || total > 0) totals.set(check.id, total);
  }
  return totals;
}

async function countChecksWithUnseen(
  raw: RawSummaryPr,
  repo: RepoInfo,
  totals: ReadonlyMap<string, number>,
  seen: ReadonlyMap<string, unknown>,
): Promise<number> {
  const ids = [...totals.keys()];
  try {
    const batch = await fetchCheckRunAnnotationsBatch(ids, {
      stateKey: { owner: repo.owner, repo: repo.name, pr: raw.number },
      headSha: raw.headRefOid,
      expectedCounts: totals,
    });
    // A check whose annotations could not be read may still hold unseen work.
    const unread = ids.filter((id) => !batch.annotations.has(id)).length;
    const unseen = [...batch.annotations.values()].filter((list) =>
      list.some((annotation) => !seen.has(annotation.id)),
    ).length;
    return unread + unseen;
  } catch (error) {
    if (pollRateLimitRetryAfterMs(error) !== null) throw error;
    return ids.length;
  }
}
