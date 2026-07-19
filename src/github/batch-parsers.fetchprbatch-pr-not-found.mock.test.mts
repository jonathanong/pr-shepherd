import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — PR not found", () => {
  it("throws when pullRequest is null", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(99, REPO)).rejects.toThrow("PR #99 not found");
  });

  it("throws a typed access error when repository is null", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue({ data: { repository: null } });
    await expect(fetchPrBatch(99, REPO)).rejects.toMatchObject({
      name: "GitHubRequestError",
      status: 200,
      message: expect.stringContaining("repository owner/repo"),
    });
  });
});
