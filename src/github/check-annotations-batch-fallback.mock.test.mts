import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "./errors.mts";

vi.mock("./client.mts", () => ({ graphql: vi.fn() }));

import { fetchCheckRunAnnotationsBatch } from "./check-annotations-batch.mts";
import { graphql } from "./client.mts";
import { CHECK_RUN_ANNOTATIONS_QUERY } from "./queries.mts";

const mockGraphql = vi.mocked(graphql);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchCheckRunAnnotationsBatch fallback", () => {
  it("retries a non-rate-limit batch failure one check run at a time", async () => {
    mockGraphql
      .mockRejectedValueOnce(new Error("Resource not accessible by integration"))
      .mockResolvedValueOnce({
        data: {
          node: {
            __typename: "CheckRun",
            annotations: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  fullDatabaseId: "100",
                  path: "src/a.mts",
                  annotationLevel: "WARNING",
                  title: null,
                  message: "kept",
                  rawDetails: null,
                  blobUrl: null,
                  location: null,
                },
              ],
            },
          },
        },
      })
      .mockRejectedValueOnce(new Error("not found"));
    const result = await fetchCheckRunAnnotationsBatch(["CR_acme_1", "CR_acme_2"]);
    expect(mockGraphql).toHaveBeenNthCalledWith(2, CHECK_RUN_ANNOTATIONS_QUERY, {
      id: "CR_acme_1",
    });
    expect(mockGraphql).toHaveBeenNthCalledWith(3, CHECK_RUN_ANNOTATIONS_QUERY, {
      id: "CR_acme_2",
    });
    expect(result.annotations.get("CR_acme_1")?.[0]?.message).toBe("kept");
    expect(result.failures.map((failure) => failure.checkRunId)).toEqual(["CR_acme_2"]);
  });

  it("does not fall back to per-check fetches when the batch hits a rate limit", async () => {
    const err = new GitHubRequestError(
      "GitHub GraphQL error (no data): API rate limit already exceeded for user ID 12345.",
      {
        status: 403,
        rateLimit: { resource: "graphql", remaining: 0, limit: 5000, resetAt: 1_800_000_000 },
      },
    );
    mockGraphql.mockRejectedValueOnce(err);
    await expect(fetchCheckRunAnnotationsBatch(["CR_acme_1", "CR_acme_2"])).rejects.toBe(err);
    expect(mockGraphql).toHaveBeenCalledTimes(1);
  });
});
