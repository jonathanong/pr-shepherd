import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({
  graphqlWithRateLimit: vi.fn(),
}));
vi.mock("./rest-feedback-read.mts", () => ({
  readRestFeedback: vi.fn(),
}));

import { graphqlWithRateLimit } from "./client.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { runWithGithubTransport } from "./transport.mts";
import { findUnresolvedThreadsByReviewId, isReviewNodeId } from "./review-unresolved-threads.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockReadRestFeedback = vi.mocked(readRestFeedback);
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

describe("findUnresolvedThreadsByReviewId", () => {
  it("paginates GraphQL reviewThreads and collects unresolved thread IDs for requested reviews only", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: true, endCursor: "c1" },
                nodes: [
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
                ],
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    id: "PRRT_2",
                    isResolved: false,
                    comments: { nodes: [{ pullRequestReview: { id: "PRR_1" } }] },
                  },
                  null,
                ],
              },
            },
          },
        },
      });

    const result = await findUnresolvedThreadsByReviewId(42, REPO, ["PRR_1", "PRR_CLEAN"]);
    expect([...result.entries()]).toEqual([["PRR_1", ["PRRT_1", "PRRT_2"]]]);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("checks CCR REST thread resolution status and skips standard REST where status is unavailable", async () => {
    mockReadRestFeedback.mockResolvedValue({
      threads: [
        { id: "rest-thread-1", reviewId: "PRR_1", isResolved: false },
        { id: "rest-thread-2", reviewId: "PRR_1", isResolved: true },
      ],
    } as never);

    const standard = await runWithGithubTransport("rest", () =>
      findUnresolvedThreadsByReviewId(42, REPO, ["PRR_1"]),
    );
    expect(standard.size).toBe(0);
    expect(mockReadRestFeedback).not.toHaveBeenCalled();

    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    try {
      const ccr = await runWithGithubTransport("rest", () =>
        findUnresolvedThreadsByReviewId(42, REPO, ["PRR_1"]),
      );
      expect([...ccr.entries()]).toEqual([["PRR_1", ["rest-thread-1"]]]);
      expect(mockReadRestFeedback).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
