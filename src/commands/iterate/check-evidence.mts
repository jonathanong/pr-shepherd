import type { AgentCheck } from "../../types.mts";

export function hasLogEvidence(check: AgentCheck): boolean {
  return (
    Boolean(check.logExcerpt?.trim()) ||
    (check.relatedJobs ?? []).some((job) => Boolean(job.logExcerpt?.trim()))
  );
}
