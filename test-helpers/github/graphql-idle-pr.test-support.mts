import { serve, pull, serveWithEtags, prefix } from "./rest-read.test-support.mts";
import { makeRawPr, makeResponse } from "./batch-fixtures.mts";

/**
 * PR #101 whose CI has finished and that waits on a requested Copilot review, served over
 * GraphQL plus the conditional REST routes its change detectors read.
 */
export interface IdlePrState {
  reviews: unknown[];
  branchFailures: number;
  branchThrottled?: boolean;
  checkStatus: "COMPLETED" | "IN_PROGRESS";
}

export const idlePrState = (): IdlePrState => ({
  reviews: [],
  branchFailures: 0,
  checkStatus: "COMPLETED",
});

const page = { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] };

function idlePr(live: IdlePrState) {
  const done = live.checkStatus === "COMPLETED";
  const check = { status: live.checkStatus, conclusion: done ? "SUCCESS" : null };
  return makeRawPr({
    number: 101,
    mergeable: "MERGEABLE",
    mergeStateStatus: "BLOCKED",
    reviewDecision: "REVIEW_REQUIRED",
    headRefOid: "aaa111",
    // A requested Copilot review keeps the finished PR waiting instead of READY.
    reviewRequests: { nodes: [{ requestedReviewer: { login: "copilot-pull-request-reviewer" } }] },
    baseRef: { rules: { pageInfo: { hasNextPage: false }, nodes: [] } },
    reviewThreads: page,
    commits: {
      totalCount: 1,
      nodes: [
        {
          commit: {
            oid: "aaa111",
            committedDate: "2026-10-09T00:00:00Z",
            statusCheckRollup: {
              state: done ? "SUCCESS" : "PENDING",
              contexts: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ __typename: "CheckRun", id: "CR_1", name: "ci", ...check }],
              },
            },
            checkSuites: {
              pageInfo: { hasNextPage: false },
              nodes: [{ id: "CS_1", ...check, workflowRun: null }],
            },
          },
        },
      ],
    },
  });
}

/** The detector reads, in the order an idle wait tick makes them. */
export const IDLE_PR_DETECTORS = [
  `${prefix}/pulls/101`,
  `${prefix}/commits/aaa111/check-runs`,
  `${prefix}/commits/aaa111/check-suites`,
  `${prefix}/commits/aaa111/statuses`,
  `${prefix}/pulls/101/reviews`,
  `${prefix}/issues/101/comments`,
  `${prefix}/pulls/101/comments`,
  `${prefix}/branches/main`,
];

export async function serveIdlePr(live: IdlePrState): Promise<void> {
  serveWithEtags();
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    if (path === "/graphql") response.end(JSON.stringify(makeResponse(idlePr(live), "me")));
    else if (path === `${prefix}/pulls/101`)
      response.end(JSON.stringify({ ...pull, mergeable_state: "blocked" }));
    else if (path === `${prefix}/commits/aaa111/check-runs`)
      response.end(JSON.stringify({ total_count: 0, check_runs: [] }));
    else if (path === `${prefix}/commits/aaa111/check-suites`)
      response.end(JSON.stringify({ total_count: 0, check_suites: [] }));
    else if (path === `${prefix}/pulls/101/reviews`) response.end(JSON.stringify(live.reviews));
    else if (path === `${prefix}/branches/main`) {
      if (live.branchThrottled) {
        live.branchThrottled = false;
        response.statusCode = 403;
        response.end('{"message":"You have exceeded a secondary rate limit."}');
      } else if (live.branchFailures > 0) {
        live.branchFailures--;
        response.statusCode = 503;
        response.end('{"message":"unavailable"}');
      } else response.end(JSON.stringify({ name: "main", commit: { sha: "bbb222" } }));
    } else response.end("[]");
  });
}
