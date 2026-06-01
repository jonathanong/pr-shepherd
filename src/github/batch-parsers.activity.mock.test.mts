import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./client.mts", () => ({
  graphql: vi.fn(),
  graphqlWithRateLimit: vi.fn(),
}));

import { fetchPrBatch } from "./batch.mts";
import { graphql, graphqlWithRateLimit } from "./client.mts";

const mockGraphql = vi.mocked(graphql);
const mockGraphqlWithRateLimit = vi.mocked(graphqlWithRateLimit);

const REPO = { owner: "owner", name: "repo" };

function makeRawPr(overrides: Record<string, unknown> = {}) {
  return {
    id: "PR_kgDOAAA",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "abc123",
    headRefName: "feature",
    headRepository: { nameWithOwner: "owner/repo" },
    baseRefName: "main",
    reviewRequests: { nodes: [] },
    latestReviews: { nodes: [] },
    reviewThreads: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    comments: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    changesRequestedReviews: {
      pageInfo: { hasPreviousPage: false, startCursor: null },
      nodes: [],
    },
    reviewSummaries: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    approvedReviews: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    allReviews: { totalCount: 0 },
    commits: {
      totalCount: 1,
      nodes: [{ commit: { committedDate: "2024-01-01T00:00:00Z", statusCheckRollup: null } }],
    },
    ...overrides,
  };
}

function makeResponse(pr: ReturnType<typeof makeRawPr> | null = makeRawPr()) {
  return { data: { repository: { pullRequest: pr } } };
}

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
    ]);
  });
});
