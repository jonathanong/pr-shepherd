import type { RepoInfo } from "./client.mts";
import type { RawBaseRef, RawBranchProtectionRule, RawRepositoryRule } from "./batch-raw-rules.mts";
import { readRest as rest } from "./rest-reader-core.mts";
import { GitHubRequestError } from "./errors.mts";
import {
  readRestPages,
  restRepoPath,
  restObject,
  restString,
  restArray,
  restNumber,
} from "./rest-reader-core.mts";

export async function readRestBranchRules(
  repo: RepoInfo,
  branch: string,
): Promise<{ baseRef?: RawBaseRef; unavailable: Array<{ field: string; reason: string }> }> {
  const path = `${restRepoPath(repo)}/branches/${encodeURIComponent(branch)}/protection`;
  let classic: RawBranchProtectionRule | null = null;
  const unavailable: Array<{ field: string; reason: string }> = [];
  try {
    const data = restObject(await rest<unknown>("GET", path), "branch protection");
    const approvals =
      data.required_pull_request_reviews == null
        ? null
        : restObject(data.required_pull_request_reviews, "required reviews");
    const checks =
      data.required_status_checks == null
        ? null
        : restObject(data.required_status_checks, "required checks");
    classic = {
      requiresApprovingReviews: approvals !== null,
      requiredApprovingReviewCount: approvals
        ? restNumber(approvals.required_approving_review_count, "required approval count")
        : 0,
      requiresConversationResolution: enabled(data.required_conversation_resolution),
      requiresStatusChecks: checks !== null,
      requiredStatusCheckContexts: checks
        ? restArray(checks.contexts, "check contexts").map((context) =>
            restString(context, "check context"),
          )
        : [],
      requiresCodeOwnerReviews: approvals?.require_code_owner_reviews === true,
      requireLastPushApproval: approvals?.require_last_push_approval === true,
      requiresCommitSignatures: enabled(data.required_signatures),
      requiresLinearHistory: enabled(data.required_linear_history),
      requiresStrictStatusChecks: checks?.strict === true,
    };
  } catch (error) {
    if (!(error instanceof GitHubRequestError) || ![403, 404].includes(error.status ?? 0))
      throw error;
    // Only GitHub's explicit unprotected response proves absence. A generic
    // 404 may hide protection from a token without administration access.
    if (!isUnprotectedBranch(error))
      unavailable.push({
        field: "branchProtection",
        reason: `Classic branch protection unavailable (HTTP ${error.status})`,
      });
  }
  let rules: RawRepositoryRule[] | undefined;
  try {
    const data = await readRestPages<Record<string, unknown>>(
      `${restRepoPath(repo)}/rules/branches/${encodeURIComponent(branch)}`,
    );
    rules = data.nodes.map((rule) => {
      const type = restString(rule.type, "branch rule type").toUpperCase();
      const p =
        rule.parameters == null ? {} : restObject(rule.parameters, "branch rule parameters");
      return {
        type,
        parameters: {
          ...(p.required_approving_review_count !== undefined && {
            requiredApprovingReviewCount: restNumber(
              p.required_approving_review_count,
              "ruleset approval count",
            ),
          }),
          ...(p.required_review_thread_resolution !== undefined && {
            requiredReviewThreadResolution: p.required_review_thread_resolution === true,
          }),
          ...(p.require_code_owner_review !== undefined && {
            requireCodeOwnerReview: p.require_code_owner_review === true,
          }),
          ...(p.require_last_push_approval !== undefined && {
            requireLastPushApproval: p.require_last_push_approval === true,
          }),
          ...(p.strict_required_status_checks_policy !== undefined && {
            strictRequiredStatusChecksPolicy: p.strict_required_status_checks_policy === true,
          }),
          ...(p.required_status_checks !== undefined && {
            requiredStatusChecks: restArray(p.required_status_checks, "ruleset status checks").map(
              (check) => ({
                context: restString(restObject(check, "status check").context, "required context"),
              }),
            ),
          }),
          ...(p.required_deployment_environments !== undefined && {
            requiredDeploymentEnvironments: restArray(
              p.required_deployment_environments,
              "required deployments",
            ).map((environment) => restString(environment, "deployment environment")),
          }),
        },
      };
    });
  } catch (error) {
    if (!(error instanceof GitHubRequestError) || ![403, 404].includes(error.status ?? 0))
      throw error;
    unavailable.push({
      field: "branchRules",
      reason: `Branch rules unavailable (HTTP ${error.status})`,
    });
  }
  // Preserve partial known policy, but keep incompleteness explicit to READY consumers.
  const baseRef =
    classic !== null || rules !== undefined
      ? {
          branchProtectionRule: classic,
          rules: rules === undefined ? null : { pageInfo: { hasNextPage: false }, nodes: rules },
        }
      : undefined;
  return { ...(baseRef && { baseRef }), unavailable };
}
function isUnprotectedBranch(error: GitHubRequestError): boolean {
  if (error.status !== 404) return false;
  try {
    const body: unknown = JSON.parse(error.responseMessage ?? "");
    return (
      body !== null &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>)["message"] === "Branch not protected"
    );
  } catch {
    return false;
  }
}
function enabled(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    restObject(value, "protection requirement").enabled === true
  );
}
