import type { RepoInfo } from "./client.mts";
import type { BatchPrData } from "../types.mts";
import { restPullRefs, type RestPull } from "./rest-pr-core.mts";
import { readRestFeedback, restReviewToReview } from "./rest-feedback-read.mts";
import { readRestCommitChecks } from "./rest-check-read.mts";
import { readRestBranchRules } from "./rest-rules-read.mts";
import { readRestStackMembership } from "./rest-stack-read.mts";
import { mergeStartupFailureChecks } from "../checks/startup-failures.mts";
import { parseCheckNodes } from "./batch-parse-checks.mts";
import { parseBranchRules } from "./batch-parsers-rules.mts";
import { readRest as rest, restRepoPath, restObject } from "./rest-reader-core.mts";
import { restLatestReviews, restPendingReviews } from "./rest-review-read.mts";
export async function readRestSnapshot(pull: RestPull, repo: RepoInfo) {
  const [feedback, checks, rules, stack] = await Promise.all([
    readRestFeedback(pull.number, repo),
    readRestCommitChecks(pull.head.sha, repo, pull.number),
    readRestBranchRules(repo, pull.base.ref),
    readRestStackMembership(pull.number, repo),
  ]);
  const repository = restObject(
    await rest<unknown>("GET", restRepoPath(repo)),
    "repository merge settings",
  );
  const allowedMergeMethods = [
    ...(repository.allow_merge_commit === true ? ["merge" as const] : []),
    ...(repository.allow_squash_merge === true ? ["squash" as const] : []),
    ...(repository.allow_rebase_merge === true ? ["rebase" as const] : []),
  ];
  const latestReviews = restLatestReviews(feedback.reviews);
  const requested = [
    ...(pull.requested_reviewers ?? []).map((reviewer) => ({ login: reviewer.login })),
    ...(pull.requested_teams ?? []).map((team) => ({ login: team.name })),
  ];
  const changes = feedback.reviews.filter(
    (review) =>
      review.state === "CHANGES_REQUESTED" &&
      !["APPROVED", "DISMISSED"].includes(
        latestReviews.get(review.user?.login.toLowerCase() ?? "")?.state ?? "",
      ),
  );
  const transportUnavailable = [
    ...feedback.unavailable,
    ...rules.unavailable,
    {
      field: "reviewDecision",
      reason:
        "REST does not expose an aggregate review decision; latest review states are supplied",
    },
    { field: "viewerAuthorization", reason: "REST does not expose viewer capability fields" },
    {
      field: "comments.isMinimized",
      reason: "REST does not expose minimization state or support minimizing comments",
    },
    {
      field: "mergeQueue",
      reason: "REST does not expose queue membership, entry or removal history",
    },
  ];
  const data: BatchPrData = {
    nodeId: pull.node_id,
    ...restPullRefs(pull),
    state: restPullRefs(pull).state as BatchPrData["state"],
    isDraft: pull.draft,
    mergeable:
      pull.mergeable === true ? "MERGEABLE" : pull.mergeable === false ? "CONFLICTING" : "UNKNOWN",
    mergeStateStatus: pull.mergeable_state.toUpperCase() as BatchPrData["mergeStateStatus"],
    reviewDecision: null,
    headRepoWithOwner: pull.head.repo?.full_name ?? null,
    reviewRequests: requested,
    latestReviews: [...restPendingReviews(feedback.reviews), ...latestReviews.values()],
    reviewThreads: feedback.threads,
    comments: feedback.comments,
    changesRequestedReviews: changes.map(restReviewToReview),
    reviewSummaries: feedback.reviews
      .filter((review) => review.state === "COMMENTED" && review.body?.trim())
      .map(restReviewToReview),
    approvedReviews: feedback.reviews
      .filter((review) => review.state === "APPROVED")
      .map(restReviewToReview),
    checks: mergeStartupFailureChecks(
      parseCheckNodes(checks.nodes),
      checks.suites.flatMap((suite) => {
        const run = checks.workflowRuns.find((run) => run.check_suite_id === suite.id);
        if (suite.conclusion?.toUpperCase() !== "STARTUP_FAILURE" || !run) return [];
        return [
          {
            name: run.name || `workflow run ${run.id}`,
            status: "COMPLETED" as const,
            conclusion: "STARTUP_FAILURE" as const,
            source: "startup_failure" as const,
            detailsUrl: run.html_url,
            event: run.event,
            runId: String(run.id),
          },
        ];
      }),
    ),
    branchProtection: rules.baseRef?.branchProtectionRule
      ? {
          requiresApprovingReviews: rules.baseRef.branchProtectionRule.requiresApprovingReviews,
          requiredApprovingReviewCount:
            rules.baseRef.branchProtectionRule.requiredApprovingReviewCount,
          requiresConversationResolution:
            rules.baseRef.branchProtectionRule.requiresConversationResolution,
          requiresStatusChecks: rules.baseRef.branchProtectionRule.requiresStatusChecks,
          requiredStatusCheckContexts:
            rules.baseRef.branchProtectionRule.requiredStatusCheckContexts ?? [],
        }
      : null,
    ...(rules.baseRef && { branchRules: parseBranchRules(rules.baseRef) }),
    ...(typeof repository.allow_merge_commit === "boolean" &&
      typeof repository.allow_squash_merge === "boolean" &&
      typeof repository.allow_rebase_merge === "boolean" && { allowedMergeMethods }),
    stack: stack
      ? {
          number: stack.number,
          size: stack.pull_requests.length,
          position: stack.pull_requests.findIndex((member) => member.number === pull.number) + 1,
          baseRefName: stack.base.ref,
        }
      : null,
    transport: "rest",
    transportUnavailable,
  };
  return { data, feedback, checks, rules };
}
