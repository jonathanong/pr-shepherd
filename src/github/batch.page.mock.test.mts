import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch.test-support.mts";
import { fetchPrBatch } from "./batch.mts";
import { BATCH_PR_PAGE_QUERY } from "./queries.mts";

registerHooks();

describe("fetchPrBatch — slim combined extra pages", () => {
  it("sends outstanding thread and check cursors in one follow-up", async () => {
    const makeCheckNode = (name: string) => ({
      __typename: "CheckRun",
      name,
      status: "COMPLETED",
      conclusion: "SUCCESS",
      detailsUrl: null,
      checkSuite: null,
    });
    const firstPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-t" },
        nodes: [{ id: "t-2", isResolved: false, isOutdated: false, comments: { nodes: [] } }],
      },
      commits: {
        nodes: [
          {
            commit: {
              oid: "aaa",
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: true, endCursor: "cursor-ch" },
                  nodes: [makeCheckNode("check-1")],
                },
              },
            },
          },
        ],
      },
    });
    const nextPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "t-1", isResolved: false, isOutdated: false, comments: { nodes: [] } }],
      },
      commits: {
        nodes: [
          {
            commit: {
              oid: "aaa",
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
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse(nextPage));

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewThreads.map((t) => t.id)).toEqual(["t-1", "t-2"]);
    expect(data.checks.map((c) => c.name)).toEqual(["check-1", "check-2"]);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(2);
    expect(mockGraphqlWithRateLimit.mock.calls[1]?.[0]).toBe(BATCH_PR_PAGE_QUERY);
    expect(mockGraphqlWithRateLimit.mock.calls[1]?.[1]).toMatchObject({
      includeThreads: true,
      includeChecks: true,
      includeComments: false,
    });
  });

  it("throws when remaining is 0 before an extra page", async () => {
    const firstPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-t" },
        nodes: [{ id: "t-2", isResolved: false, isOutdated: false, comments: { nodes: [] } }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValueOnce({
      ...makeResponse(firstPage),
      rateLimit: { remaining: 0, limit: 5000, resetAt: 1 },
    });

    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("pagination incomplete");
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });

  it("treats a check page whose rollup has no contexts as the last page", async () => {
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
              oid: "aaa",
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
        nodes: [{ commit: { oid: "aaa", statusCheckRollup: {} } }],
      },
    });
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse(nextPage));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks.map((c) => c.name)).toEqual(["check-1"]);
  });

  it("throws when an included extra-page connection is missing", async () => {
    const firstPage = makeRawPr({
      comments: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-c" },
        nodes: [],
      },
    });
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce({ data: { repository: { pullRequest: {} } } });
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("PR #42 not found");
  });

  it("sets checkSuitesComplete when the suite page is complete", async () => {
    mockGraphqlWithRateLimit.mockResolvedValueOnce(
      makeResponse(
        makeRawPr({
          commits: {
            nodes: [
              {
                commit: {
                  checkSuites: { pageInfo: { hasNextPage: false }, nodes: [] },
                  statusCheckRollup: null,
                },
              },
            ],
          },
        }),
      ),
    );
    const result = await fetchPrBatch(42, REPO);
    expect(result.checkSuitesComplete).toBe(true);
  });
});
