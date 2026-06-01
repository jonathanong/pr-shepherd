import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./client.mts", () => ({
  graphql: vi.fn(),
  graphqlWithRateLimit: vi.fn(),
}));

import { fetchPrBatch } from "./batch.mts";
import { graphql, graphqlWithRateLimit } from "./client.mts";
import { REPO, makeRawPr, makeResponse } from "../../test-helpers/github/batch-fixtures.mts";

const mockGraphql = vi.mocked(graphql);
const mockGraphqlWithRateLimit = vi.mocked(graphqlWithRateLimit);

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphql.mockResolvedValue(makeResponse());
  mockGraphqlWithRateLimit.mockResolvedValue(makeResponse());
});

describe("fetchPrBatch — PR activity", () => {
  it("summarizes commits, review rounds, and review items since the latest commit", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeRawPr({
          allReviews: { totalCount: 4 },
          comments: {
            pageInfo: { hasPreviousPage: false, startCursor: null },
            nodes: [
              {
                id: "IC_old",
                isMinimized: false,
                url: "https://example.test/old",
                author: { __typename: "User", login: "reviewer" },
                body: "old",
                createdAt: "2023-12-31T23:59:00Z",
              },
              {
                id: "IC_new",
                isMinimized: false,
                url: "https://example.test/new",
                author: { __typename: "User", login: "reviewer" },
                body: "new",
                createdAt: "2024-01-01T00:01:00Z",
              },
            ],
          },
          reviewThreads: {
            pageInfo: { hasPreviousPage: false, startCursor: null },
            nodes: [
              {
                id: "PRRT_1",
                isResolved: false,
                isOutdated: false,
                path: "src/a.ts",
                line: 4,
                startLine: null,
                comments: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      id: "PRRC_1",
                      isMinimized: false,
                      url: "https://example.test/thread",
                      author: { __typename: "User", login: "reviewer" },
                      pullRequestReview: { id: "PRR_1" },
                      body: "thread note",
                      path: "src/a.ts",
                      line: 4,
                      startLine: null,
                      createdAt: "2024-01-01T00:02:00Z",
                    },
                  ],
                },
              },
            ],
          },
          reviewSummaries: {
            pageInfo: { hasPreviousPage: false, startCursor: null },
            nodes: [
              {
                id: "PRR_1",
                isMinimized: false,
                author: { __typename: "Bot", login: "review-bot" },
                body: "summary note",
                createdAt: "2024-01-01T00:03:00Z",
              },
            ],
          },
          changesRequestedReviews: {
            pageInfo: { hasPreviousPage: false, startCursor: null },
            nodes: [
              {
                id: "PRR_CR",
                author: { __typename: "User", login: "reviewer" },
                body: "please change",
                createdAt: "2024-01-01T00:04:00Z",
              },
              {
                id: "PRR_CR_DONE",
                author: { __typename: "User", login: "former-reviewer" },
                body: "old change request body",
                createdAt: "2024-01-01T00:05:00Z",
              },
            ],
          },
          latestReviews: {
            nodes: [
              { author: { __typename: "User", login: "former-reviewer" }, state: "APPROVED" },
            ],
          },
          approvedReviews: {
            pageInfo: { hasPreviousPage: false, startCursor: null },
            nodes: [
              {
                id: "PRR_AP_EMPTY",
                isMinimized: false,
                author: { __typename: "User", login: "reviewer" },
                body: "",
                createdAt: "2024-01-01T00:06:00Z",
              },
              {
                id: "PRR_AP",
                isMinimized: false,
                author: { __typename: "User", login: "reviewer" },
                body: "approved with note",
                createdAt: "2024-01-01T00:07:00Z",
              },
            ],
          },
          commits: {
            totalCount: 3,
            nodes: [
              {
                commit: {
                  committedDate: "2024-01-01T00:00:00Z",
                  statusCheckRollup: null,
                },
              },
            ],
          },
        }),
      ),
    );

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.activity!.commitCount).toBe(3);
    expect(data.activity!.reviewRoundCount).toBe(4);
    expect(data.activity!.reviewItemsSinceLatestCommit.map((item) => item.id)).toEqual([
      "IC_new",
      "PRRC_1",
      "PRR_1",
      "PRR_CR",
      "PRR_CR_DONE",
      "PRR_AP",
    ]);
    expect(data.changesRequestedReviews.map((r) => r.id)).toEqual(["PRR_CR"]);
  });
});
