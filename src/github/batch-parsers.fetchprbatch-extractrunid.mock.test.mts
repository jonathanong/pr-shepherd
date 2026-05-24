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

describe("fetchPrBatch — extractRunId", () => {
  it("returns null when detailsUrl is null", async () => {
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
                      name: "c",
                      status: "COMPLETED",
                      conclusion: "SUCCESS",
                      detailsUrl: null,
                      checkSuite: null,
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
    expect(data.checks[0]!.runId).toBeNull();
  });

  it("returns null when URL has no /runs/ segment", async () => {
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
                      name: "c",
                      status: "COMPLETED",
                      conclusion: "SUCCESS",
                      detailsUrl: "https://example.com/jobs/1",
                      checkSuite: null,
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
    expect(data.checks[0]!.runId).toBeNull();
  });
});
