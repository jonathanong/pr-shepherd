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
