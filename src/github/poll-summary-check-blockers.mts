import { resolveCheckBlockerGate } from "../commands/iterate/check-blocker-gate.mts";
import type { PollSummaryChecks, PollSummaryItem, PollSummaryReview } from "../types.mts";
import { failingSummaryCheckNames } from "./poll-summary-checks.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

type Routed = Pick<PollSummaryItem, "action" | "reasons">;

/**
 * A layer whose only failing checks are deferred on open blockers waits.
 * Review work, conflicts, an incomplete rollup, or any check that is not
 * deferred stay on the routed action. Stack rows are probed so the planner
 * does not start a one-PR session for a wait it would otherwise shepherd.
 */
export async function applyOpenCheckBlockers(
  raw: RawSummaryPr,
  repo: { owner: string; name: string },
  routed: Routed,
  checks: PollSummaryChecks,
  review: PollSummaryReview,
  stack: boolean,
): Promise<Routed & { pollProbe?: true }> {
  if (routed.action !== "fix_code" || !routed.reasons.includes("failing-checks")) return routed;
  if ((review.actionable ?? 0) > 0 || checks.incomplete) return routed;
  const names = failingSummaryCheckNames(raw);
  if (names.length === 0) return routed;
  const gate = await resolveCheckBlockerGate(
    { owner: repo.owner, repo: repo.name, pr: raw.number },
    names.map((name) => ({ name })),
  );
  if (!gate || !names.every((name) => gate.deferredNames.has(name))) return routed;
  return {
    action: "wait",
    reasons: gate.openBlockers.map((ref) => `blocked-by:${ref}`),
    ...(stack ? { pollProbe: true as const } : {}),
  };
}
