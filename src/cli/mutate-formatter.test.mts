import { describe, expect, it } from "vitest";
import { formatMutateResult } from "./mutate-formatter.mts";
import type { ResolveResult } from "../comments/resolve.mts";

function makeResult(overrides: Partial<ResolveResult> = {}): ResolveResult {
  return {
    repliedThreads: [],
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
    ...overrides,
  };
}

describe("formatMutateResult", () => {
  it("renders nothing when no mutations occurred", () => {
    expect(formatMutateResult(makeResult())).toBe("");
  });

  it("renders successful and skipped mutation ids", () => {
    const output = formatMutateResult(
      makeResult({
        repliedThreads: ["thread-1"],
        resolvedThreads: ["thread-2"],
        minimizedComments: ["comment-1"],
        dismissedReviews: ["review-1"],
        skippedDismissals: ["review-2"],
        skippedHumanResolves: ["thread-3"],
        skippedHumanMinimizes: ["comment-2"],
        skippedHumanDismissals: ["review-3"],
        skippedNonHumanReplies: ["thread-4"],
      }),
    );

    expect(output).toContain("Replied to threads (1): thread-1");
    expect(output).toContain("Resolved threads (1): thread-2");
    expect(output).toContain("Minimized comments (1): comment-1");
    expect(output).toContain("Dismissed reviews (1): review-1");
    expect(output).toContain("Skipped dismissals (1): review-2");
    expect(output).toContain("Skipped human thread resolves (1): thread-3");
    expect(output).toContain("Skipped human minimizes (1): comment-2");
    expect(output).toContain("Skipped human review dismissals (1): review-3");
    expect(output).toContain("Skipped non-human/unknown thread replies (1): thread-4");
  });

  it("renders rate limit details, pending ids, and non-rate-limit errors", () => {
    const output = formatMutateResult(
      makeResult({
        errors: ["rate limit: secondary limit", "thread-1: reply returned null"],
        rateLimit: {
          message: "secondary limit",
          retryAfterSeconds: 60,
          remaining: 0,
          limit: 5000,
          resetAt: 1_700_000_000,
        },
        unrepliedThreads: ["thread-1"],
        unresolvedThreads: ["thread-2"],
        unminimizedComments: ["comment-1"],
        undismissedReviews: ["review-1"],
      }),
    );

    expect(output).toContain(
      "Stopped: GitHub rate limit hit — secondary limit (retry after 60s, remaining 0/5000, reset at 2023-11-14T22:13:20.000Z)",
    );
    expect(output).toContain("Not replied due to rate limit (1): thread-1");
    expect(output).toContain("Not resolved due to rate limit (1): thread-2");
    expect(output).toContain("Not minimized due to rate limit (1): comment-1");
    expect(output).toContain("Not dismissed due to rate limit (1): review-1");
    expect(output).toContain("Errors:\n  thread-1: reply returned null");
    expect(output).not.toContain("rate limit: secondary limit");
  });

  it("renders rate limit messages without optional details", () => {
    expect(
      formatMutateResult(
        makeResult({
          rateLimit: { message: "secondary limit" },
        }),
      ),
    ).toBe("Stopped: GitHub rate limit hit — secondary limit");
  });
});
