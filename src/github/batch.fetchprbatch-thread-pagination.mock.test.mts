import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphql,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

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

  it("paginates comments within a review thread when the nested connection is incomplete", async () => {
    const comment = (id: string, body: string) => ({
      id,
      isMinimized: false,
      url: `https://github.com/owner/repo/pull/42#discussion_${id}`,
      author: { __typename: "User", login: "alice" },
      body,
      path: "src/a.ts",
      line: 1,
      startLine: null,
      createdAt: "2024-01-01T00:00:00Z",
    });
    const firstPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "t-1",
            isResolved: false,
            isOutdated: false,
            path: "src/a.ts",
            line: 1,
            startLine: null,
            comments: {
              pageInfo: { hasNextPage: true, endCursor: "comment-cursor-1" },
              nodes: [comment("c-1", "first")],
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue({
      data: {
        node: {
          comments: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [comment("c-2", "reply")],
          },
        },
      },
    });

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.reviewThreads[0]?.body).toBe("first");
    expect(data.reviewThreads[0]?.comments?.map((c) => [c.id, c.body])).toEqual([
      ["c-1", "first"],
      ["c-2", "reply"],
    ]);
  });

  it("throws when a paginated review thread disappears", async () => {
    const firstPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "t-missing",
            isResolved: false,
            isOutdated: false,
            comments: {
              pageInfo: { hasNextPage: true, endCursor: "comment-cursor-1" },
              nodes: [],
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue({ data: { node: null } });

    await expect(fetchPrBatch(42, REPO)).rejects.toThrow(
      "Review thread t-missing did not resolve to PullRequestReviewThread while paginating comments (node type: null)",
    );
  });

  it("throws when a paginated review thread resolves to a different node type", async () => {
    const firstPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "t-wrong-type",
            isResolved: false,
            isOutdated: false,
            comments: {
              pageInfo: { hasNextPage: true, endCursor: "comment-cursor-1" },
              nodes: [],
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue({ data: { node: { __typename: "Issue" } } });

    await expect(fetchPrBatch(42, REPO)).rejects.toThrow(
      "Review thread t-wrong-type did not resolve to PullRequestReviewThread while paginating comments (node type: Issue)",
    );
  });
});
