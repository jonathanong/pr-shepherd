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
