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
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "abc123",
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
// PR not found
// ---------------------------------------------------------------------------

describe("fetchPrBatch — PR not found", () => {
  it("throws when pullRequest is null", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(99, REPO)).rejects.toThrow("PR #99 not found");
  });
});

// ---------------------------------------------------------------------------
// CheckRun vs StatusContext mapping
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// extractRunId
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ReviewThread.isMinimized — mapped from first comment node
// ---------------------------------------------------------------------------

describe("fetchPrBatch — reviewThread isMinimized mapping", () => {
  function makeThreadNode(id: string, isMinimized: boolean) {
    return {
      id,
      isResolved: false,
      isOutdated: false,
      comments: {
        nodes: [
          {
            id: `${id}-c`,
            isMinimized,
            author: { login: "alice" },
            body: "body",
            path: "foo.ts",
            line: 1,
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      },
    };
  }

  it("sets isMinimized=true when first comment node is minimized", async () => {
    const pr = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [makeThreadNode("t-1", true)],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewThreads[0]!.isMinimized).toBe(true);
  });

  it("sets isMinimized=false when first comment node is not minimized", async () => {
    const pr = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [makeThreadNode("t-2", false)],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewThreads[0]!.isMinimized).toBe(false);
  });

  it("defaults isMinimized=false when thread has no comment nodes", async () => {
    const pr = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "t-3", isResolved: false, isOutdated: false, comments: { nodes: [] } }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewThreads[0]!.isMinimized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseCreatedAt — invalid ISO → 0
// ---------------------------------------------------------------------------

describe("fetchPrBatch — parseCreatedAt", () => {
  it("uses 0 for invalid date strings", async () => {
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
                  id: "c",
                  isMinimized: false,
                  author: { login: "alice" },
                  body: "hi",
                  path: "foo.ts",
                  line: 1,
                  createdAt: "not-a-date",
                },
              ],
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewThreads[0]!.createdAtUnix).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reviewRequests — team fallback
// ---------------------------------------------------------------------------

describe("fetchPrBatch — team reviewer fallback", () => {
  it("uses name when login is absent (team reviewer)", async () => {
    const pr = makeRawPr({
      reviewRequests: {
        nodes: [{ requestedReviewer: { name: "my-team" } }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewRequests[0]!.login).toBe("my-team");
  });

  it("skips reviewRequests with no login or name", async () => {
    const pr = makeRawPr({
      reviewRequests: {
        nodes: [{ requestedReviewer: null }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewRequests).toHaveLength(0);
  });
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

// ---------------------------------------------------------------------------
// Pagination — threads backward
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pagination — changesRequestedReviews backward
// ---------------------------------------------------------------------------

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
