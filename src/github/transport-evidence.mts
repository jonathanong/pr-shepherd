interface TransportEvidence {
  transport?: "rest";
  transportUnavailable?: Array<{ field: string; reason: string }>;
}

/** A future GitHub state cannot prove readiness through a negative blocker list. */
export function isKnownMergeStateStatus(status: string): boolean {
  return [
    "BEHIND",
    "BLOCKED",
    "CLEAN",
    "DIRTY",
    "DRAFT",
    "HAS_HOOKS",
    "UNKNOWN",
    "UNSTABLE",
  ].includes(status);
}

/** Missing feedback cannot certify readiness, even when GitHub reports CLEAN. */
export function transportReadinessGaps(
  value: TransportEvidence,
  mergeStateStatus: string,
): Array<{ field: string; reason: string }> {
  if (value.transport !== "rest") return [];
  return (value.transportUnavailable ?? []).filter(
    ({ field }) =>
      /^(reviewThreads|reviewTranscripts|changesRequestedReviews|reviewSummaries|checks|checkRuns|checkSuites|checkAnnotations|annotations|nativeStack)(?:\.|$)/.test(
        field,
      ) ||
      (mergeStateStatus !== "CLEAN" &&
        ["reviewDecision", "branchProtection", "branchRules", "mergeRequirements"].some(
          (policy) => field === policy || field.startsWith(`${policy}.`),
        )),
  );
}
