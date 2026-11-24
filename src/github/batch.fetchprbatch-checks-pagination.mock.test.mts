import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — checks pagination", () => {
  it("marks the snapshot unread, with no fingerprint, for a null check context", async () => {
    const pr = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [null],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));

    const result = await fetchPrBatch(42, REPO);
    expect(result.data.checks).toEqual([]);
    expect(result.data.unreadNodes).toEqual({ checks: true });
    expect(result.fingerprint).toBeUndefined();
  });

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
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse(nextPage));

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
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse(nullRollupPage));

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
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse(nextPage));

    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("head commit changed");
  });
});
