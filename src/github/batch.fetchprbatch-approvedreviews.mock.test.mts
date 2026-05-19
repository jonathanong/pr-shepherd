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
