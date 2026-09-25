import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../github/errors.mts";
import type { ClassifiedCheck } from "../types.mts";

vi.mock("../github/client.mts", () => ({ graphql: vi.fn() }));

import { attachAndMergeCheckAnnotations } from "./check-annotations.mts";
import { graphql } from "../github/client.mts";
import { CHECK_RUN_ANNOTATIONS_BATCH_QUERY } from "../github/queries.mts";

const mockGraphql = vi.mocked(graphql);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

function check(id: string): ClassifiedCheck {
  return {
    id,
    name: `unit ${id}`,
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "",
    event: "pull_request",
    runId: null,
    category: "passed",
    hasAnnotations: true,
  };
}

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `CR_acme_${index + 1}`);
}

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

function checkNode(
  id: string,
  message: string,
  hasNextPage = false,
  endCursor: string | null = null,
) {
  return {
    id,
    __typename: "CheckRun",
    annotations: {
      pageInfo: { hasNextPage, endCursor },
      nodes: [raw(message)],
    },
  };
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

function attach(list: ClassifiedCheck[]) {
  return attachAndMergeCheckAnnotations(
    { passing: list, failing: [], skipped: [], filtered: [], ignored: [] },
    new Map(),
    7,
  );
}

function stderrText(stderr: { mock: { calls: unknown[][] } }): string {
  return stderr.mock.calls.map((args) => String(args[0])).join("");
}

describe("attachUnseenCheckAnnotations", () => {
  it("rethrows a first-chunk rate limit without later fetches or per-check stderr", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const err = rateLimit();
    mockGraphql.mockRejectedValueOnce(err);

    await expect(attach(ids(21).map(check))).rejects.toBe(err);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(CHECK_RUN_ANNOTATIONS_BATCH_QUERY, {
      ids: ids(21).slice(0, 20),
    });
    const text = stderrText(stderr);
    expect(text).not.toContain("annotation fetch failed");
    expect(text).not.toContain('check "');
  });

  it("ignores a follow-up failure, annotates the other check, and prints one line", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          nodes: [checkNode("CR_acme_1", "kept"), checkNode("CR_acme_2", "partial", true, "c2")],
        },
      })
      .mockRejectedValueOnce(new Error("check run deleted"));

    const result = await attach([check("CR_acme_1"), check("CR_acme_2")]);

    expect(result.passing[0]?.annotations?.[0]?.message).toBe("kept");
    expect(result.passing[1]?.annotations).toBeUndefined();
    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(stderrText(stderr)).toBe(
      "pr-shepherd: annotation fetch failed for 1 check on PR #7 (ignored): check run deleted\n",
    );
  });

  it("continues after a non-rate-limit chunk error and summarizes every failed check once", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql
      .mockRejectedValueOnce(new Error("resource not accessible"))
      .mockResolvedValueOnce({ data: { nodes: [checkNode("CR_acme_21", "late")] } });

    const result = await attach(ids(21).map(check));

    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(mockGraphql).toHaveBeenLastCalledWith(CHECK_RUN_ANNOTATIONS_BATCH_QUERY, {
      ids: ["CR_acme_21"],
    });
    expect(result.passing[0]?.annotations).toBeUndefined();
    expect(result.passing[20]?.annotations?.[0]?.message).toBe("late");
    expect(stderrText(stderr)).toBe(
      "pr-shepherd: annotation fetch failed for 20 checks on PR #7 (ignored): resource not accessible\n",
    );
  });
});
