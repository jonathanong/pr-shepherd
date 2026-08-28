import { graphql } from "../../github/http.mts";
import { MARK_PR_READY_MUTATION } from "../../github/queries.mts";
import type { IterateResult, IterateResultBase, ShepherdReport } from "../../types.mts";
import { buildEscalateHumanMessage, buildEscalateSuggestion } from "./escalate.mts";

export async function markReadyIfAuthorized(
  enabled: boolean,
  base: IterateResultBase,
  report: ShepherdReport,
): Promise<IterateResult | null> {
  if (!enabled) return null;

  if (report.viewerAuthorization?.viewerCanUpdate === true) {
    await graphql(MARK_PR_READY_MUTATION, { pullRequestId: report.nodeId });
    return {
      ...base,
      action: "mark_ready",
      markedReady: true,
      log: `MARKED READY: PR #${report.pr} converted from draft to ready for review`,
    };
  }

  const escalation = {
    triggers: ["authorization-required" as const],
    unresolvedThreads: [],
    ambiguousComments: [],
    changesRequestedReviews: [],
    authorization: [
      {
        action: "mark-ready" as const,
        targetIds: [report.nodeId],
        reason: "denied-or-unverifiable" as const,
      },
    ],
    suggestion: buildEscalateSuggestion(["authorization-required"]),
  };
  return {
    ...base,
    action: "escalate",
    escalate: {
      ...escalation,
      humanMessage: buildEscalateHumanMessage(escalation, report.pr),
    },
  };
}
