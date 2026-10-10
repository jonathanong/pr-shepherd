import { graphql } from "../../github/http.mts";
import { MARK_PR_READY_MUTATION } from "../../github/queries.mts";
import type { IterateResult, IterateResultBase, ShepherdReport } from "../../types.mts";
import { buildEscalateHumanMessage, buildEscalateSuggestion } from "./escalate.mts";
import { rest } from "../../github/http.mts";
import { githubOperation, isCcrTransport } from "../../github/transport.mts";
import { canGenerateGithubMutation } from "../../github/mutation-policy.mts";
import { UnsupportedRestOperationError } from "../../github/unsupported-rest.mts";
import { GitHubRequestError } from "../../github/errors.mts";
import { isRestSessionRefusal } from "../../github/rest-session-refusal.mts";
import { rateLimitKind } from "../../github/rate-limit-kind.mts";

export async function markReadyIfAuthorized(
  enabled: boolean,
  base: IterateResultBase,
  report: ShepherdReport,
): Promise<IterateResult | null> {
  if (!enabled) return null;
  if (report.fingerprintReused === true) {
    return {
      ...base,
      action: "mark_ready",
      markedReady: false,
      log: `READY: PR #${report.pr} is ready to mark; refresh required before converting draft`,
    };
  }

  let unsupported: string | undefined;
  if (canGenerateGithubMutation(report.viewerAuthorization?.viewerCanUpdate, "ready")) {
    try {
      await githubOperation(
        "MarkPrReady",
        async () => {
          await graphql(MARK_PR_READY_MUTATION, { pullRequestId: report.nodeId });
        },
        async () => {
          if (!isCcrTransport())
            throw new UnsupportedRestOperationError(
              "markPullRequestReadyForReview",
              "ready-for-review requires the cloud CCR proxy",
            );
          const response = await rest<{ draft?: boolean }>(
            "POST",
            `/repos/${report.repo}/pulls/${report.pr}/ccr/ready_for_review`,
          );
          if (response?.draft !== false)
            throw new Error(
              "CCR ready_for_review did not confirm draft:false; refresh the PR before retrying",
            );
        },
        { mutation: true },
      );
      return {
        ...base,
        action: "mark_ready",
        markedReady: true,
        log: `MARKED READY: PR #${report.pr} converted from draft to ready for review`,
      };
    } catch (error) {
      if (
        error instanceof UnsupportedRestOperationError ||
        isRestSessionRefusal(error) ||
        (error instanceof GitHubRequestError && error.status === 404)
      )
        unsupported = error.message;
      else if (
        !(error instanceof GitHubRequestError) ||
        error.status !== 403 ||
        rateLimitKind(error) !== null
      )
        throw error;
    }
  } else if (report.transport === "rest" && report.viewerAuthorization?.viewerCanUpdate !== false) {
    unsupported = "Ready-for-review requires the cloud CCR proxy";
  }

  const escalation = {
    triggers: [
      unsupported ? ("transport-unsupported" as const) : ("authorization-required" as const),
    ],
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
    suggestion: unsupported ?? buildEscalateSuggestion(["authorization-required"]),
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
