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

/**
 * Missing feedback cannot certify readiness, even when GitHub reports CLEAN. Missing branch policy
 * blocks only a non-CLEAN state, whose unmet requirements Shepherd derives from that policy. The
 * aggregate `reviewDecision` is never a readiness input on either transport (approvals come from
 * branch policy plus latest reviews), so its absence alone is not a gap.
 */
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
        ["branchProtection", "branchRules", "mergeRequirements"].some(
          (policy) => field === policy || field.startsWith(`${policy}.`),
        )),
  );
}
