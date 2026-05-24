import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

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
