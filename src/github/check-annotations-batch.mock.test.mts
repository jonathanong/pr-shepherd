import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { GitHubRequestError } from "./errors.mts";

vi.mock("./client.mts", () => ({ graphql: vi.fn() }));

import { fetchCheckRunAnnotationsBatch } from "./check-annotations-batch.mts";
import { graphql } from "./client.mts";
import { CHECK_RUN_ANNOTATIONS_BATCH_QUERY, CHECK_RUN_ANNOTATIONS_QUERY } from "./queries.mts";

const mockGraphql = vi.mocked(graphql);
const stateKey = { owner: "acme", repo: "widgets", pr: 7 };
let testStateDir = "";

beforeEach(() => {
  vi.clearAllMocks();
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-annotation-batch-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

function raw(message: string) {
  return {
    fullDatabaseId: "100",
    path: "src/a.mts",
    annotationLevel: "WARNING",
    title: null,
    message,
    rawDetails: null,
    blobUrl: null,
    location: null,
  };
}

function connection(message: string, hasNextPage = false, endCursor: string | null = null) {
  return { pageInfo: { hasNextPage, endCursor }, nodes: [raw(message)] };
}

function checkNode(
  id: string,
  message: string,
  hasNextPage = false,
  endCursor: string | null = null,
) {
  return { id, __typename: "CheckRun", annotations: connection(message, hasNextPage, endCursor) };
}

function rateLimit(): GitHubRequestError {
  return new GitHubRequestError(
    "GitHub GraphQL error (no data): API rate limit already exceeded for user ID 12345.",
    {
      status: 403,
      rateLimit: { resource: "graphql", remaining: 0, limit: 5000, resetAt: 1_800_000_000 },
    },
  );
}

describe("fetchCheckRunAnnotationsBatch", () => {
  it("loads several uncached check runs in one batched request", async () => {
    mockGraphql.mockResolvedValueOnce({
      data: {
        nodes: [
          checkNode("CR_acme_1", "a"),
          checkNode("CR_acme_2", "b"),
          checkNode("CR_acme_3", "c"),
        ],
      },
    });

    const result = await fetchCheckRunAnnotationsBatch(["CR_acme_1", "CR_acme_2", "CR_acme_3"]);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(CHECK_RUN_ANNOTATIONS_BATCH_QUERY, {
      ids: ["CR_acme_1", "CR_acme_2", "CR_acme_3"],
    });
    expect(result.failures).toEqual([]);
    expect(result.annotations.get("CR_acme_2")?.[0]?.message).toBe("b");
  });

  it("skips check runs that are still inside the one-hour cache", async () => {
    const cacheOpts = { stateKey, headSha: "sha-acme" };
    mockGraphql.mockResolvedValueOnce({
      data: { nodes: [checkNode("CR_acme_1", "kept"), checkNode("CR_acme_2", "also")] },
    });
    await fetchCheckRunAnnotationsBatch(["CR_acme_1", "CR_acme_2"], cacheOpts);

    mockGraphql.mockResolvedValueOnce({ data: { nodes: [checkNode("CR_acme_3", "new")] } });
    const second = await fetchCheckRunAnnotationsBatch(
      ["CR_acme_1", "CR_acme_2", "CR_acme_3"],
      cacheOpts,
    );

    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(mockGraphql).toHaveBeenLastCalledWith(CHECK_RUN_ANNOTATIONS_BATCH_QUERY, {
      ids: ["CR_acme_3"],
    });
    expect(second.annotations.get("CR_acme_1")?.[0]?.message).toBe("kept");
    expect(second.annotations.get("CR_acme_3")?.[0]?.id).toBe("check_annotation_100");
  });

  it("follows up once, and only for the check run whose first page has another page", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          nodes: [
            checkNode("CR_acme_1", "first", true, "cursor-1"),
            checkNode("CR_acme_2", "only"),
          ],
        },
      })
      .mockResolvedValueOnce({
        data: { node: { __typename: "CheckRun", annotations: connection("second") } },
      });

    const result = await fetchCheckRunAnnotationsBatch(["CR_acme_1", "CR_acme_2"]);

    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(mockGraphql).toHaveBeenNthCalledWith(2, CHECK_RUN_ANNOTATIONS_QUERY, {
      id: "CR_acme_1",
      cursor: "cursor-1",
    });
    expect(result.annotations.get("CR_acme_1")?.map((item) => item.message)).toEqual([
      "first",
      "second",
    ]);
    expect(result.annotations.get("CR_acme_2")?.map((item) => item.message)).toEqual(["only"]);
  });

  it("returns no annotations for a null node or a node that is not a CheckRun", async () => {
    mockGraphql.mockResolvedValueOnce({
      data: {
        nodes: [
          null,
          { id: "CR_acme_2", __typename: "StatusContext" },
          checkNode("CR_acme_3", "ok"),
        ],
      },
    });

    const result = await fetchCheckRunAnnotationsBatch(["CR_acme_1", "CR_acme_2", "CR_acme_3"]);

    expect(result.failures).toEqual([]);
    expect(result.annotations.get("CR_acme_1")).toEqual([]);
    expect(result.annotations.get("CR_acme_2")).toEqual([]);
    expect(result.annotations.get("CR_acme_3")?.[0]?.message).toBe("ok");
  });

  it("stops later follow-up pages when one page hits a rate limit", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const err = rateLimit();
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          nodes: [
            checkNode("CR_acme_1", "one", true, "c1"),
            checkNode("CR_acme_2", "two", true, "c2"),
          ],
        },
      })
      .mockRejectedValueOnce(err);

    await expect(fetchCheckRunAnnotationsBatch(["CR_acme_1", "CR_acme_2"])).rejects.toBe(err);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(mockGraphql).toHaveBeenNthCalledWith(2, CHECK_RUN_ANNOTATIONS_QUERY, {
      id: "CR_acme_1",
      cursor: "c1",
    });
    expect(stderr.mock.calls.map((args) => String(args[0])).join("")).not.toContain(
      "annotation fetch failed",
    );
  });
});
