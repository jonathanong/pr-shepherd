import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "./batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — check type mapping", () => {
  it("maps CheckRun nodes with event and runId", async () => {
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
                      name: "tests",
                      status: "COMPLETED",
                      conclusion: "SUCCESS",
                      detailsUrl: "https://github.com/owner/repo/actions/runs/9999/jobs/1",
                      checkSuite: { workflowRun: { event: "pull_request" } },
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
    expect(data.checks).toHaveLength(1);
    expect(data.checks[0]!.name).toBe("tests");
    expect(data.checks[0]!.event).toBe("pull_request");
    expect(data.checks[0]!.runId).toBe("9999");
  });
  it("maps StatusContext SUCCESS → COMPLETED/SUCCESS", async () => {
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
                      __typename: "StatusContext",
                      context: "ci/external",
                      state: "SUCCESS",
                      targetUrl: "https://example.com",
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
    expect(data.checks[0]!.status).toBe("COMPLETED");
    expect(data.checks[0]!.conclusion).toBe("SUCCESS");
    expect(data.checks[0]!.event).toBeNull();
    expect(data.checks[0]!.runId).toBeNull();
  });
  it("maps StatusContext FAILURE → COMPLETED/FAILURE", async () => {
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
                      __typename: "StatusContext",
                      context: "lint",
                      state: "FAILURE",
                      targetUrl: null,
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
    expect(data.checks[0]!.conclusion).toBe("FAILURE");
  });
  it("maps StatusContext PENDING → IN_PROGRESS/null", async () => {
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
                      __typename: "StatusContext",
                      context: "pending",
                      state: "PENDING",
                      targetUrl: null,
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
    expect(data.checks[0]!.status).toBe("IN_PROGRESS");
    expect(data.checks[0]!.conclusion).toBeNull();
  });
  it("drops unknown __typename nodes", async () => {
    const pr = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [{ __typename: "UnknownType", name: "mystery" }],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks).toHaveLength(0);
  });
});
