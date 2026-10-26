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
 * filtered, ignored or neutral) as actionable work. The compact summary only has annotation
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
  const totalsKnown = await hydrateAnnotationTotals(raw, repo);
  const candidates = nonSuccessCheckIds(raw, required, totalsKnown);
  if (candidates.length === 0) return routed;
  const count = totalsKnown
    ? await countChecksWithUnseen(raw, repo, candidates, seen)
    : candidates.length;
  if (count === 0) return routed;
  checks.annotated = count;
  return { action: "triage", reasons: ["check-annotations"] };
}

/** Completed, non-SUCCESS head checks that report annotations (or may, when totals are unknown). */
function nonSuccessCheckIds(
  raw: RawSummaryPr,
  required: readonly string[],
  totalsKnown: boolean,
): string[] {
  const head = new Map(
    (raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []).flatMap((node) =>
      node.__typename === "CheckRun" && node.id
        ? [[node.id, node.annotations?.totalCount] as const]
        : [],
    ),
  );
  return classifiedSummaryChecks(raw, required).flatMap((check) => {
    if (check.scope || check.id == null || !head.has(check.id)) return [];
    if (check.category === "in_progress" || check.category === "superseded") return [];
    if (check.status !== "COMPLETED" || check.conclusion === "SUCCESS") return [];
    return totalsKnown && !((head.get(check.id) ?? 0) > 0) ? [] : [check.id];
  });
}

async function countChecksWithUnseen(
  raw: RawSummaryPr,
  repo: RepoInfo,
  ids: string[],
  seen: ReadonlyMap<string, unknown>,
): Promise<number> {
  try {
    const batch = await fetchCheckRunAnnotationsBatch(ids, {
      stateKey: { owner: repo.owner, repo: repo.name, pr: raw.number },
      headSha: raw.headRefOid,
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
