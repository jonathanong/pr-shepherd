import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

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

  it("maps the top comment pull request review id onto the review thread", async () => {
    const pr = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "t-review",
            isResolved: false,
            isOutdated: false,
            comments: {
              nodes: [
                {
                  id: "t-review-c",
                  isMinimized: false,
                  pullRequestReview: { id: "PRR_PARENT" },
                  author: { login: "copilot" },
                  body: "body",
                  path: "foo.ts",
                  line: 1,
                  createdAt: "2024-01-01T00:00:00Z",
                },
              ],
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewThreads[0]!.reviewId).toBe("PRR_PARENT");
    expect(data.reviewThreads[0]!.comments?.[0]?.reviewId).toBe("PRR_PARENT");
  });
});
