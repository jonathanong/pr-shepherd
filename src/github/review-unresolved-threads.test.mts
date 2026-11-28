import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({
  graphqlWithRateLimit: vi.fn(),
}));
vi.mock("./rest-feedback-read.mts", () => ({
  readRestFeedback: vi.fn(),
}));
vi.mock("./rest-identities.mts", () => ({
  resolveRestIdentity: vi.fn(),
}));

import { graphqlWithRateLimit } from "./client.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { resolveRestIdentity } from "./rest-identities.mts";
import { runWithGithubTransport } from "./transport.mts";
import {
  checkThreadsStillUnresolved,
  findUnresolvedThreadsByReviewId,
  isReviewNodeId,
} from "./review-unresolved-threads.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockReadRestFeedback = vi.mocked(readRestFeedback);
const mockResolveRestIdentity = vi.mocked(resolveRestIdentity);
const REPO = { owner: "owner", name: "repo" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isReviewNodeId", () => {
  it("recognizes next-gen PRR_ and legacy base64 PullRequestReview IDs, and ignores comments/threads", () => {
    expect(isReviewNodeId("PRR_kwDOSaSRXM8AAAABa1C5RQ")).toBe(true);
    expect(isReviewNodeId(Buffer.from("017:PullRequestReview12345").toString("base64"))).toBe(true);
    expect(isReviewNodeId("IC_kwDOSaSRXM8AAAAB123")).toBe(false);
    expect(isReviewNodeId("PRRT_kwDOSaSRXM69AKWE")).toBe(false);
    expect(isReviewNodeId("comment-1")).toBe(false);
  });
});

describe("checkThreadsStillUnresolved", () => {
  it("queries only the given thread node IDs and treats non-confirmed threads as unresolved", async () => {
    mockGraphql.mockResolvedValueOnce({
      data: {
        nodes: [{ id: "PRRT_1", isResolved: false }, { id: "PRRT_2", isResolved: true }, null],
      },
    });

    const still = await checkThreadsStillUnresolved(42, REPO, ["PRRT_1", "PRRT_2", "PRRT_NULL"]);
    expect([...still]).toEqual(["PRRT_1", "PRRT_NULL"]);
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(expect.any(String), {
      ids: ["PRRT_1", "PRRT_2", "PRRT_NULL"],
    });
  });

  it("keeps cached thread IDs unresolved under REST when thread resolution status is unavailable", async () => {
    mockReadRestFeedback.mockResolvedValueOnce({
      threads: [{ id: "rest-thread-1", reviewId: "PRR_1" }],
      unavailable: [{ field: "reviewThreads.status", reason: "unavailable" }],
    } as never);

    const still = await runWithGithubTransport("rest", () =>
      checkThreadsStillUnresolved(42, REPO, ["PRRT_1"]),
    );
    expect([...still]).toEqual(["PRRT_1"]);
  });

  it("matches resolved CCR REST threads by REST ID and GraphQL alias while preserving unmatched IDs", async () => {
    mockReadRestFeedback.mockResolvedValueOnce({
      threads: [
        { id: "rest-thread-1", reviewId: "PRR_1", isResolved: false },
        { id: "rest-thread-2", reviewId: "PRR_1", isResolved: true },
        { id: "rest-thread-3", reviewId: "PRR_1", isResolved: true },
      ],
      unavailable: [],
    } as never);
    mockResolveRestIdentity
      .mockResolvedValueOnce({
        repo: REPO,
        pr: 42,
        numericId: "2",
        kind: "thread",
        graphqlThreadId: "PRRT_2",
      })
      .mockRejectedValueOnce(new Error("no recorded identity"));

    const still = await runWithGithubTransport("rest", () =>
      checkThreadsStillUnresolved(42, REPO, [
        "rest-thread-1",
        "PRRT_2",
        "rest-thread-3",
        "PRRT_UNMATCHED",
      ]),
    );
    expect([...still]).toEqual(["rest-thread-1", "PRRT_UNMATCHED"]);
  });
});

function threadsPage(
  hasNextPage: boolean,
  endCursor: string | null,
  nodes: Array<{
    id: string;
    isResolved: boolean;
    comments: { nodes: Array<{ pullRequestReview: { id: string } }> };
  } | null> = [],
) {
  return {
    data: {
      repository: {
        pullRequest: { reviewThreads: { pageInfo: { hasNextPage, endCursor }, nodes } },
      },
    },
  };
}

describe("findUnresolvedThreadsByReviewId", () => {
  it("paginates GraphQL reviewThreads and collects unresolved thread IDs for requested reviews only", async () => {
    mockGraphql
      .mockResolvedValueOnce(
        threadsPage(true, "c1", [
          {
            id: "PRRT_1",
            isResolved: false,
            comments: { nodes: [{ pullRequestReview: { id: "PRR_1" } }] },
          },
          {
            id: "PRRT_resolved",
            isResolved: true,
            comments: { nodes: [{ pullRequestReview: { id: "PRR_1" } }] },
          },
          {
            id: "PRRT_other",
            isResolved: false,
            comments: { nodes: [{ pullRequestReview: { id: "PRR_OTHER" } }] },
          },
        ]),
      )
      .mockResolvedValueOnce(
        threadsPage(false, null, [
          {
            id: "PRRT_2",
            isResolved: false,
            comments: { nodes: [{ pullRequestReview: { id: "PRR_1" } }] },
          },
          null,
        ]),
      );

    const result = await findUnresolvedThreadsByReviewId(42, REPO, ["PRR_1", "PRR_CLEAN"]);
    expect([...result.entries()]).toEqual([["PRR_1", ["PRRT_1", "PRRT_2"]]]);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("fails closed when GraphQL pagination reports hasNextPage without an advancing endCursor", async () => {
    mockGraphql.mockResolvedValueOnce(threadsPage(true, null));
    await expect(findUnresolvedThreadsByReviewId(42, REPO, ["PRR_1"])).rejects.toThrow(
      "Review thread pagination returned hasNextPage without advancing endCursor",
    );

    mockGraphql
      .mockResolvedValueOnce(threadsPage(true, "stuck"))
      .mockResolvedValueOnce(threadsPage(true, "stuck"));
    await expect(findUnresolvedThreadsByReviewId(42, REPO, ["PRR_1"])).rejects.toThrow(
      "Review thread pagination returned hasNextPage without advancing endCursor",
    );
  });

  it("treats unknown REST thread resolution as blocking and respects CCR resolved flags", async () => {
    mockReadRestFeedback.mockResolvedValueOnce({
      threads: [{ id: "rest-thread-unknown", reviewId: "PRR_1" }],
      unavailable: [{ field: "reviewThreads.status", reason: "unavailable" }],
    } as never);

    const standard = await runWithGithubTransport("rest", () =>
      findUnresolvedThreadsByReviewId(42, REPO, ["PRR_1", "PRR_NO_THREADS"]),
    );
    expect([...standard.entries()]).toEqual([["PRR_1", ["rest-thread-unknown"]]]);
    expect(mockReadRestFeedback).toHaveBeenCalledTimes(1);

    mockReadRestFeedback.mockResolvedValueOnce({
      threads: [
        { id: "rest-thread-1", reviewId: "PRR_1", isResolved: false },
        { id: "rest-thread-2", reviewId: "PRR_1", isResolved: true },
      ],
      unavailable: [],
    } as never);

    const ccr = await runWithGithubTransport("rest", () =>
      findUnresolvedThreadsByReviewId(42, REPO, ["PRR_1"]),
    );
    expect([...ccr.entries()]).toEqual([["PRR_1", ["rest-thread-1"]]]);
    expect(mockReadRestFeedback).toHaveBeenCalledTimes(2);
  });
});
