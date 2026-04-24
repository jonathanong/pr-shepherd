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
    commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
    ...overrides,
  };
}

function makeResponse(pr: ReturnType<typeof makeRawPr> | null = makeRawPr()) {
  return { data: { repository: { pullRequest: pr } } };
}

function makeContextPr(node: Record<string, unknown>) {
  return makeRawPr({
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              contexts: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node] },
            },
          },
        },
      ],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphql.mockResolvedValue(makeResponse());
  mockGraphqlWithRateLimit.mockResolvedValue(makeResponse());
});

describe("fetchPrBatch — check summary field", () => {
  it("uses CheckRun.title as summary when present", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeContextPr({
          __typename: "CheckRun",
          name: "ci",
          status: "COMPLETED",
          conclusion: "FAILURE",
          detailsUrl: null,
          title: "2 tests failed",
          summary: "long markdown body",
          checkSuite: null,
        }),
      ),
    );
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks[0]!.summary).toBe("2 tests failed");
  });

  it("falls back to first non-empty line of CheckRun.summary when title is null", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeContextPr({
          __typename: "CheckRun",
          name: "ci",
          status: "COMPLETED",
          conclusion: "FAILURE",
          detailsUrl: null,
          title: null,
          summary: "\nfirst real line\nsecond line",
          checkSuite: null,
        }),
      ),
    );
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks[0]!.summary).toBe("first real line");
  });

  it("leaves summary undefined when both title and summary are null", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeContextPr({
          __typename: "CheckRun",
          name: "ci",
          status: "COMPLETED",
          conclusion: "SUCCESS",
          detailsUrl: null,
          title: null,
          summary: null,
          checkSuite: null,
        }),
      ),
    );
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks[0]!.summary).toBeUndefined();
  });

  it("uses StatusContext.description as summary", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeContextPr({
          __typename: "StatusContext",
          context: "codecov/patch",
          state: "FAILURE",
          targetUrl: "https://app.codecov.io",
          description: "67.68% of diff hit (target 85.00%)",
        }),
      ),
    );
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks[0]!.summary).toBe("67.68% of diff hit (target 85.00%)");
  });

  it("leaves summary undefined when StatusContext.description is null", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeContextPr({
          __typename: "StatusContext",
          context: "ci/status",
          state: "SUCCESS",
          targetUrl: null,
          description: null,
        }),
      ),
    );
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.checks[0]!.summary).toBeUndefined();
  });
});
