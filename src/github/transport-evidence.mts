import { getGithubTransportReason } from "./transport.mts";

/** `{ transportReason }` while REST is in use, so a result says why it is not on GraphQL. */
export function transportReasonField(): { transportReason?: string } {
  const transportReason = getGithubTransportReason();
  return transportReason ? { transportReason } : {};
}

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
 * REST has no resolved/outdated thread state. When branch policy requires conversation resolution,
 * GitHub's CLEAN merge state proves no unresolved thread exists, so the unknown status is not a
 * readiness gap. Without that policy, or on any other merge state, the gap stands.
 */
export function conversationResolutionProven(
  mergeStateStatus: string,
  requiresConversationResolution: boolean | undefined,
): boolean {
  return mergeStateStatus === "CLEAN" && requiresConversationResolution === true;
}

/**
 * Missing feedback cannot certify readiness, even when GitHub reports CLEAN. Missing branch policy
 * blocks only a non-CLEAN state, whose unmet requirements Shepherd derives from that policy. The
 * aggregate `reviewDecision` is never a readiness input on either transport (approvals come from
 * branch policy plus latest reviews), so its absence alone is not a gap. Unknown thread status
 * (`reviewThreads.status`) is cleared by `conversationResolutionProven`.
 */
export function transportReadinessGaps(
  value: TransportEvidence,
  mergeStateStatus: string,
  requiresConversationResolution?: boolean,
): Array<{ field: string; reason: string }> {
  if (value.transport !== "rest") return [];
  const threadStatusProven = conversationResolutionProven(
    mergeStateStatus,
    requiresConversationResolution,
  );
  return (value.transportUnavailable ?? []).filter(
    ({ field }) =>
      (field === "reviewThreads.status" && !threadStatusProven) ||
      (field !== "reviewThreads.status" &&
        /^(reviewThreads|reviewTranscripts|changesRequestedReviews|reviewSummaries|checks|checkRuns|checkSuites|checkAnnotations|annotations|nativeStack)(?:\.|$)/.test(
          field,
        )) ||
      (mergeStateStatus !== "CLEAN" &&
        ["branchProtection", "branchRules", "mergeRequirements"].some(
          (policy) => field === policy || field.startsWith(`${policy}.`),
        )),
  );
}
