import type { BatchPrData } from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import type { RestPull } from "./rest-pr-core.mts";
import type { readRestFeedback } from "./rest-feedback-read.mts";
import type { readRestCommitChecks } from "./rest-check-read.mts";
import type { readRestBranchRules } from "./rest-rules-read.mts";
export function restSummary(
  data: BatchPrData,
  pull: RestPull,
  feedback: Awaited<ReturnType<typeof readRestFeedback>>,
  checks: Awaited<ReturnType<typeof readRestCommitChecks>>,
  baseRef: Awaited<ReturnType<typeof readRestBranchRules>>["baseRef"],
): RawSummaryPr {
  const connection = <T,>(nodes: T[]) => ({
    nodes,
    totalCount: nodes.length,
    pageInfo: { hasPreviousPage: false },
  });
  const comments = feedback.comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    author: { login: comment.author, __typename: comment.authorType },
    url: comment.url,
    authorAssociation: comment.authorAssociation,
  }));
  return {
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    author: pull.user,
    state: data.state,
    isDraft: data.isDraft,
    ...(data.autoMergeRequest && { autoMergeRequest: data.autoMergeRequest }),
    updatedAt: pull.updated_at,
    headRefName: data.headRefName,
    headRefOid: data.headRefOid,
    baseRefOid: pull.base.sha,
    baseRefName: data.baseRefName,
    ...(baseRef && { baseRef }),
    mergeable: data.mergeable,
    mergeStateStatus: data.mergeStateStatus,
    reviewDecision: null,
    reviewRequests: {
      nodes: data.reviewRequests.map((request) => ({ requestedReviewer: request })),
    },
    latestReviews: {
      nodes: data.latestReviews.map((review) => ({
        state: review.state,
        author: { login: review.login },
      })),
    },
    mergeQueueEntry: null,
    stack: data.stack
      ? { number: data.stack.number, size: data.stack.size, baseRefName: data.stack.baseRefName }
      : null,
    stackEntry: data.stack ? { position: data.stack.position } : null,
    comments: connection(comments),
    reviews: connection(
      feedback.reviews.map((review) => ({
        id: review.node_id,
        body: review.body ?? "",
        state: review.state,
        author: review.user ? { login: review.user.login, __typename: review.user.type } : null,
        authorAssociation: review.author_association,
        url: review.html_url,
      })),
    ),
    reviewThreads: connection(
      data.reviewThreads.map((thread) => ({
        id: thread.id,
        ...(thread.isResolved !== undefined && { isResolved: thread.isResolved }),
        ...(thread.isOutdated !== undefined && { isOutdated: thread.isOutdated }),
        path: thread.path,
        comments: connection(
          (thread.comments ?? []).map((comment) => ({
            id: comment.id,
            body: comment.body,
            author: { login: comment.author, __typename: comment.authorType },
            url: comment.url,
            authorAssociation: comment.authorAssociation,
          })),
        ),
      })),
    ),
    commits: {
      nodes: [
        {
          commit: {
            oid: data.headRefOid,
            statusCheckRollup: {
              contexts: connection(
                checks.nodes.map((check) =>
                  check.__typename === "CheckRun"
                    ? {
                        ...check,
                        detailsUrl: check.detailsUrl ?? undefined,
                        annotations: { totalCount: check.annotations!.totalCount! },
                        checkSuite: check.checkSuite
                          ? {
                              ...check.checkSuite,
                              workflowRun: check.checkSuite.workflowRun
                                ? {
                                    ...check.checkSuite.workflowRun,
                                    workflow: check.checkSuite.workflowRun.workflow
                                      ? {
                                          ...check.checkSuite.workflowRun.workflow,
                                          databaseId:
                                            check.checkSuite.workflowRun.workflow.databaseId!,
                                        }
                                      : null,
                                  }
                                : null,
                            }
                          : null,
                      }
                    : check,
                ),
              ),
            },
            checkSuites: {
              nodes: checks.suites.map((suite) => ({
                status: suite.status.toUpperCase(),
                conclusion: suite.conclusion?.toUpperCase() ?? null,
                workflowRun:
                  checks.workflowRuns.find((run) => run.check_suite_id === suite.id) ?? null,
              })),
            },
          },
        },
      ],
    },
    transport: "rest",
    transportUnavailable: data.transportUnavailable,
  };
}
