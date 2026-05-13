// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  REPO,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "./batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — PR not found", () => {
  it("throws when pullRequest is null", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(99, REPO)).rejects.toThrow("PR #99 not found");
  });
});
