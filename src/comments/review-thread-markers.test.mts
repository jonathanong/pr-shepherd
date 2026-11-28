import { describe, expect, it, vi } from "vitest";
import { markReviewInlineThreadMarkers } from "./review-thread-markers.mts";
import { markReviewInlineThreads, markReviewUnresolvedThreads } from "../state/seen-comments.mts";
import type { ReviewThread } from "../types.mts";

vi.mock("../state/seen-comments.mts", () => ({
  markReviewInlineThreads: vi.fn().mockResolvedValue(undefined),
  markReviewUnresolvedThreads: vi.fn().mockResolvedValue(undefined),
}));

const mockMarkReviewInlineThreads = vi.mocked(markReviewInlineThreads);
const mockMarkReviewUnresolvedThreads = vi.mocked(markReviewUnresolvedThreads);
const stateKey = { owner: "owner", repo: "repo", pr: 1 };

function thread(overrides: Partial<ReviewThread>): ReviewThread {
  return {
    id: "t-default",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/file.mts",
    line: 1,
    startLine: null,
    author: "reviewer",
    authorType: "User",
    body: "body",
    url: "",
    createdAtUnix: 0,
    ...overrides,
  };
}

describe("markReviewInlineThreadMarkers", () => {
  it("groups inline and unresolved thread ids by review id with stable sorted values", async () => {
    await markReviewInlineThreadMarkers(
      stateKey,
      [
        thread({ id: "thread-b", reviewId: "PRR_1", isResolved: true }),
        thread({ id: "thread-a", reviewId: "PRR_1", isResolved: false }),
        thread({ id: "thread-c", reviewId: "PRR_2", isResolved: undefined }),
        thread({ id: "thread-ignored" }),
      ],
      ["PRR_1", "PRR_EMPTY"],
    );

    expect(mockMarkReviewInlineThreads).toHaveBeenCalledTimes(2);
    expect(mockMarkReviewInlineThreads).toHaveBeenCalledWith(
      stateKey,
      "PRR_1",
      ["thread-a", "thread-b"],
      ["thread-a"],
    );
    expect(mockMarkReviewInlineThreads).toHaveBeenCalledWith(
      stateKey,
      "PRR_2",
      ["thread-c"],
      ["thread-c"],
    );
    expect(mockMarkReviewUnresolvedThreads).toHaveBeenCalledTimes(1);
    expect(mockMarkReviewUnresolvedThreads).toHaveBeenCalledWith(stateKey, "PRR_EMPTY", []);
  });
});
