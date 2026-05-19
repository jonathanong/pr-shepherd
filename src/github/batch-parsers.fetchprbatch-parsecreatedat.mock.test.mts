import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "./batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

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
