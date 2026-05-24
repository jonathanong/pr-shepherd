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
