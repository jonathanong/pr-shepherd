import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphql,
  mockGraphqlWithRateLimit,
} from "./batch.test-support.mts";
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
});
