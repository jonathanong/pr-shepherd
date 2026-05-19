import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphql,
  mockGraphqlWithRateLimit,
} from "./batch.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — checks pagination", () => {
  it("paginates forward when hasNextPage is true", async () => {
    const makeCheckNode = (name: string) => ({
      __typename: "CheckRun",
      name,
      status: "COMPLETED",
      conclusion: "SUCCESS",
      detailsUrl: null,
      checkSuite: null,
    });
    const firstPage = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: true, endCursor: "cursor-ch1" },
                  nodes: [makeCheckNode("check-1")],
                },
              },
            },
          },
        ],
      },
    });
    const nextPage = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [makeCheckNode("check-2")],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(nextPage));

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks.map((c) => c.name)).toEqual(["check-1", "check-2"]);
  });

  it("falls back to empty page when statusCheckRollup is null in callback", async () => {
    const firstPage = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: true, endCursor: "cur-1" },
                  nodes: [
                    {
                      __typename: "CheckRun",
                      name: "check-1",
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
    const nullRollupPage = makeRawPr({
      commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(nullRollupPage));

    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("Check-context pagination interrupted");
  });

  it("throws when check pagination sees a different head commit", async () => {
    const makeCheckNode = (name: string) => ({
      __typename: "CheckRun",
      name,
      status: "COMPLETED",
      conclusion: "SUCCESS",
      detailsUrl: null,
      checkSuite: null,
    });
    const firstPage = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              oid: "old-sha",
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: true, endCursor: "cursor-ch1" },
                  nodes: [makeCheckNode("check-1")],
                },
              },
            },
          },
        ],
      },
    });
    const nextPage = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              oid: "new-sha",
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [makeCheckNode("check-2")],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(nextPage));

    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("head commit changed");
  });
});
