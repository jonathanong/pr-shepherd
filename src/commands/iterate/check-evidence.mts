import type { AgentCheck } from "../../types.mts";

export function hasLogEvidence(check: AgentCheck): boolean {
  return (
    Boolean(check.logExcerpt?.trim()) ||
    (check.relatedJobs ?? []).some((job) => Boolean(job.logExcerpt?.trim()))
  );
}

/** An external provider link is inspectable even when Actions log downloads are unavailable. */
export function hasQueueRecoveryEvidence(check: AgentCheck): boolean {
  return hasLogEvidence(check) || (check.runId === null && Boolean(check.detailsUrl?.trim()));
}
