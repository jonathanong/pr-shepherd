import type { AgentCheck } from "../../types.mts";
import type { Review } from "../../types.mts";

/** Build the stale-CR clause appended to the `## Changes-requested reviews` instruction. */
export function buildCrStaleClause(reviews: Review[]): string {
  const bot = reviews.some((r) => r.staleBotCr)
    ? " `[pending dismissal — already surfaced]` bullets are bot CRs from a prior tick."
    : "";
  const human = reviews.some((r) => r.staleReview && !r.staleBotCr)
    ? " `[stale]` bullets are human CRs on an old commit; ask reviewer to re-review."
    : "";
  return bot + human;
}

export function buildFailingCheckInstructions(checks: AgentCheck[]): string[] {
  if (checks.length === 0) return [];
  const hasRunId = checks.some(
    (c) => c.runId && c.conclusion !== "CANCELLED" && c.conclusion !== "STARTUP_FAILURE",
  );
  const hasCancelled = checks.some((c) => c.runId && c.conclusion === "CANCELLED");
  const hasStartupFailure = checks.some((c) => c.runId && c.conclusion === "STARTUP_FAILURE");
  const hasExternal = checks.some((c) => !c.runId && c.detailsUrl);
  const hasBare = checks.some((c) => !c.runId && !c.detailsUrl);

  const parts: string[] = [];
  if (hasRunId) {
    parts.push(
      "read any included log excerpt first; fetch the full log with `gh run view <runId> --log-failed` if insufficient; rerun with `gh run rerun <runId> --failed` for transient infra failures, or apply a code fix for real test/build failures; if API/log output lacks detail, open the run URL in the GitHub UI",
    );
  }
  if (hasCancelled) {
    parts.push(
      "for `[conclusion: CANCELLED]` entries (not concurrency-superseded — see `**superseded**`): rerun with `gh run rerun <runId>` unless already pushing new commits this tick, in which case the fresh run supersedes it; don't treat as resolved — distinct from `## Cancelled runs`",
    );
  }
  if (hasStartupFailure) {
    parts.push(
      "for `[conclusion: STARTUP_FAILURE]` entries: inspect with `gh run view <runId>`, rerun with `gh run rerun <runId>` if warranted",
    );
  }
  if (hasExternal) {
    parts.push("for `external` entries: open the URL to inspect the failure");
  }
  if (hasBare) {
    parts.push("for `(no runId)` entries: no log or URL available — escalate to a human");
  }

  return [`For each failing check under \`## Failing checks\`: ${parts.join("; ")}.`];
}
