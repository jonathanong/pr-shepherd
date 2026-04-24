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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    baseRefName: "main",
    reviewRequests: { nodes: [] },
    latestReviews: { nodes: [] },
    reviewThreads: {
      pageInfo: { hasPreviousPage: false, startCursor: null },
      nodes: [],
    },
    comments: {
      pageInfo: { hasPreviousPage: false, startCursor: null },
      nodes: [],
    },
    changesRequestedReviews: {
      pageInfo: { hasPreviousPage: false, startCursor: null },
      nodes: [],
    },
    reviewSummaries: {
      pageInfo: { hasPreviousPage: false, startCursor: null },
      nodes: [],
    },
    approvedReviews: {
      pageInfo: { hasPreviousPage: false, startCursor: null },
      nodes: [],
    },
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

// ---------------------------------------------------------------------------
// reviewSummaries — COMMENTED reviews surfaced for agent-driven minimize
// ---------------------------------------------------------------------------

describe("fetchPrBatch — reviewSummaries", () => {
  it("surfaces non-minimized COMMENTED reviews with a body", async () => {
    const pr = makeRawPr({
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          { id: "PRR_1", isMinimized: false, author: { login: "copilot" }, body: "Overview text" },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewSummaries).toHaveLength(1);
    expect(data.reviewSummaries[0]!.id).toBe("PRR_1");
    expect(data.reviewSummaries[0]!.author).toBe("copilot");
    expect(data.reviewSummaries[0]!.body).toBe("Overview text");
  });

  it("drops already-minimized COMMENTED review summaries", async () => {
    const pr = makeRawPr({
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          { id: "PRR_1", isMinimized: true, author: { login: "copilot" }, body: "Already hidden" },
          { id: "PRR_2", isMinimized: false, author: { login: "bot" }, body: "Visible" },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewSummaries).toHaveLength(1);
    expect(data.reviewSummaries[0]!.id).toBe("PRR_2");
  });

  it("drops COMMENTED reviews with empty bodies", async () => {
    const pr = makeRawPr({
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          { id: "PRR_1", isMinimized: false, author: { login: "bot" }, body: "" },
          { id: "PRR_2", isMinimized: false, author: { login: "bot" }, body: "   " },
          { id: "PRR_3", isMinimized: false, author: { login: "bot" }, body: "Real content" },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewSummaries).toHaveLength(1);
    expect(data.reviewSummaries[0]!.id).toBe("PRR_3");
  });

  it("falls back to 'unknown' when author is null", async () => {
    const pr = makeRawPr({
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_1", isMinimized: false, author: null, body: "text" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewSummaries[0]!.author).toBe("unknown");
  });

  it("CHANGES_REQUESTED reviews are not mixed into reviewSummaries", async () => {
    const pr = makeRawPr({
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_CR", author: { login: "alice" }, body: "Please fix this" }],
      },
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_CM", isMinimized: false, author: { login: "bot" }, body: "Overview" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.changesRequestedReviews.map((r) => r.id)).toEqual(["PRR_CR"]);
    expect(data.reviewSummaries.map((r) => r.id)).toEqual(["PRR_CM"]);
  });
});

describe("fetchPrBatch — thread pagination", () => {
  it("paginates backward when hasPreviousPage is true", async () => {
    const firstPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-abc" },
        nodes: [{ id: "t-2", isResolved: false, isOutdated: false, comments: { nodes: [] } }],
      },
    });
    const prevPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "t-1", isResolved: false, isOutdated: false, comments: { nodes: [] } }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(prevPage));

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewThreads.map((t) => t.id)).toEqual(["t-1", "t-2"]);
  });
});

describe("fetchPrBatch — changesRequestedReviews pagination", () => {
  it("paginates backward when hasPreviousPage is true", async () => {
    const firstPage = makeRawPr({
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-cr" },
        nodes: [{ id: "PRR_CR_2", author: { login: "alice" }, body: "Fix this" }],
      },
    });
    const prevPage = makeRawPr({
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_CR_1", author: { login: "bob" }, body: "Fix that" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(prevPage));

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.changesRequestedReviews.map((r) => r.id)).toEqual(["PRR_CR_1", "PRR_CR_2"]);
  });
});

// ---------------------------------------------------------------------------
// Pagination — reviewSummaries backward
// ---------------------------------------------------------------------------

describe("fetchPrBatch — reviewSummaries pagination", () => {
  it("paginates backward when hasPreviousPage is true", async () => {
    const firstPage = makeRawPr({
      reviewSummaries: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-rs" },
        nodes: [
          { id: "PRR_2", isMinimized: false, author: { login: "bot" }, body: "Second summary" },
        ],
      },
    });
    const prevPage = makeRawPr({
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          { id: "PRR_1", isMinimized: false, author: { login: "bot" }, body: "First summary" },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(prevPage));

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewSummaries.map((r) => r.id)).toEqual(["PRR_1", "PRR_2"]);
  });
});

// ---------------------------------------------------------------------------
// approvedReviews — APPROVED-state reviews (opt-in minimize target)
// ---------------------------------------------------------------------------

describe("fetchPrBatch — approvedReviews", () => {
  it("surfaces non-minimized APPROVED reviews", async () => {
    const pr = makeRawPr({
      approvedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_AP", isMinimized: false, author: { login: "alice" }, body: "LGTM" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.approvedReviews).toHaveLength(1);
    expect(data.approvedReviews[0]!.id).toBe("PRR_AP");
    expect(data.approvedReviews[0]!.author).toBe("alice");
  });

  it("keeps empty-body approvals (clicking Approve without commenting is common)", async () => {
    const pr = makeRawPr({
      approvedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_AP", isMinimized: false, author: { login: "alice" }, body: "" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.approvedReviews).toHaveLength(1);
  });

  it("drops already-minimized APPROVED reviews", async () => {
    const pr = makeRawPr({
      approvedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          { id: "PRR_H", isMinimized: true, author: { login: "alice" }, body: "" },
          { id: "PRR_V", isMinimized: false, author: { login: "bob" }, body: "" },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.approvedReviews.map((r) => r.id)).toEqual(["PRR_V"]);
  });

  it("falls back to 'unknown' when author is null", async () => {
    const pr = makeRawPr({
      approvedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_AP", isMinimized: false, author: null, body: "" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.approvedReviews[0]!.author).toBe("unknown");
  });

  it("paginates backward only when paginateApprovedReviews is set", async () => {
    const firstPage = makeRawPr({
      approvedReviews: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-ap" },
        nodes: [{ id: "PRR_2", isMinimized: false, author: { login: "bob" }, body: "" }],
      },
    });
    const prevPage = makeRawPr({
      approvedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_1", isMinimized: false, author: { login: "alice" }, body: "" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(prevPage));

    const { data } = await fetchPrBatch(42, REPO, { paginateApprovedReviews: true });
    expect(data.approvedReviews.map((r) => r.id)).toEqual(["PRR_1", "PRR_2"]);
  });

  it("skips approved-review backward pagination by default (opt-in via paginateApprovedReviews)", async () => {
    const firstPage = makeRawPr({
      approvedReviews: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-ap" },
        nodes: [{ id: "PRR_2", isMinimized: false, author: { login: "bob" }, body: "" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockClear();

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.approvedReviews.map((r) => r.id)).toEqual(["PRR_2"]);
    expect(mockGraphql).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Pagination — comments backward
// ---------------------------------------------------------------------------

describe("fetchPrBatch — comment pagination", () => {
  it("paginates backward when hasPreviousPage is true", async () => {
    const makeComment = (id: string) => ({
      id,
      isMinimized: false,
      author: { login: "alice" },
      body: "body",
      createdAt: "2024-01-01T00:00:00Z",
    });
    const firstPage = makeRawPr({
      comments: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-c1" },
        nodes: [makeComment("c-2")],
      },
    });
    const prevPage = makeRawPr({
      comments: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [makeComment("c-1")],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(prevPage));

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.comments.map((c) => c.id)).toEqual(["c-1", "c-2"]);
  });
});

// ---------------------------------------------------------------------------
// Pagination — checks forward
// ---------------------------------------------------------------------------

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

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks.map((c) => c.name)).toEqual(["check-1"]);
  });
});

// ---------------------------------------------------------------------------
// Pagination — PR not found errors in callbacks
// ---------------------------------------------------------------------------

describe("fetchPrBatch — PR not found in pagination callbacks", () => {
  it("throws when thread pagination callback receives null PR", async () => {
    const firstPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-t" },
        nodes: [{ id: "t-2", isResolved: false, isOutdated: false, comments: { nodes: [] } }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("PR #42 not found");
  });

  it("throws when comment pagination callback receives null PR", async () => {
    const firstPage = makeRawPr({
      comments: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-c" },
        nodes: [],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("PR #42 not found");
  });

  it("throws when changesRequestedReviews pagination callback receives null PR", async () => {
    const firstPage = makeRawPr({
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-cr" },
        nodes: [],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("PR #42 not found");
  });

  it("throws when reviewSummaries pagination callback receives null PR", async () => {
    const firstPage = makeRawPr({
      reviewSummaries: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-rs" },
        nodes: [],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("PR #42 not found");
  });
});

