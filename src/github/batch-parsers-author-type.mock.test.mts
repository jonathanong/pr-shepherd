import { describe, it, expect, vi, beforeEach } from "vitest";

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
    changesRequestedReviews: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    reviewSummaries: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    approvedReviews: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
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

describe("fetchPrBatch — author type mapping", () => {
  it("maps GitHub author __typename onto threads, comments, and reviews", async () => {
    const pr = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "t-1",
            isResolved: false,
            isOutdated: false,
            comments: {
              nodes: [
                {
                  id: "t-1-c",
                  isMinimized: false,
                  author: { __typename: "User", login: "alice" },
                  body: "thread",
                  url: "",
                  path: "foo.ts",
                  line: 1,
                  startLine: null,
                  createdAt: "2024-01-01T00:00:00Z",
                },
              ],
            },
          },
        ],
      },
      comments: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "c-1",
            isMinimized: false,
            author: { __typename: "Bot", login: "app" },
            body: "comment",
            url: "",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_CR",
            author: { __typename: "User", login: "reviewer" },
            body: "changes",
          },
        ],
      },
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_CM",
            isMinimized: false,
            author: { __typename: "Bot", login: "copilot" },
            body: "summary",
          },
        ],
      },
      approvedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_AP",
            isMinimized: false,
            author: { __typename: "User", login: "alice" },
            body: "",
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.reviewThreads[0]!.authorType).toBe("User");
    expect(data.comments[0]!.authorType).toBe("Bot");
    expect(data.changesRequestedReviews[0]!.authorType).toBe("User");
    expect(data.reviewSummaries[0]!.authorType).toBe("Bot");
    expect(data.approvedReviews[0]!.authorType).toBe("User");
  });

  it("uses Unknown for null or non-user/non-bot authors", async () => {
    const pr = makeRawPr({
      comments: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "c-unknown",
            isMinimized: false,
            author: { __typename: "Organization", login: "org" },
            body: "comment",
            url: "",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      },
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_NULL", isMinimized: false, author: null, body: "summary" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.comments[0]!.authorType).toBe("Unknown");
    expect(data.reviewSummaries[0]!.authorType).toBe("Unknown");
  });
});
