import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — workflowId mapping", () => {
  it("omits workflowId when the workflow's databaseId is absent", async () => {
    const pr = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      __typename: "CheckRun",
                      id: "CR_123",
                      name: "tests",
                      status: "COMPLETED",
                      conclusion: "SUCCESS",
                      detailsUrl: "https://github.com/owner/repo/actions/runs/9999/jobs/1",
                      checkSuite: {
                        workflowRun: {
                          event: "pull_request",
                          workflow: { name: "Final Code Review" },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks[0]!.workflowId).toBeUndefined();
  });
  it("omits workflowId when the workflow's databaseId is explicitly null", async () => {
    const pr = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      __typename: "CheckRun",
                      id: "CR_123",
                      name: "tests",
                      status: "COMPLETED",
                      conclusion: "SUCCESS",
                      detailsUrl: "https://github.com/owner/repo/actions/runs/9999/jobs/1",
                      checkSuite: {
                        workflowRun: {
                          event: "pull_request",
                          workflow: { name: "Final Code Review", databaseId: null },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks[0]!.workflowId).toBeUndefined();
  });
});
