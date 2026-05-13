// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunResolveFetch,
  mockRunResolveMutate,
  runResolveFetch,
  runResolveMutate,
  stdoutSpy,
} from "./cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — resolve", () => {
  it("calls runResolveFetch when no mutation flags are given (fetch mode)", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [],
      resolutionOnlyThreads: [],
      actionableComments: [],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: true,
      instructions: ["No actionable items — end this invocation."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    expect(mockRunResolveFetch).toHaveBeenCalledTimes(1);
    expect(mockRunResolveMutate).not.toHaveBeenCalled();
  });
  it("formatFetchResult renders reviewSummaries section and includes them in total", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [],
      resolutionOnlyThreads: [],
      actionableComments: [],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [
        {
          id: "PRR_1",
          author: "copilot",
          authorType: "Unknown" as const,
          body: "## PR overview\nsome detail",
        },
      ],
      commitSuggestionsEnabled: true,
      instructions: ["Classify every item."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(out).toContain("## Review summaries (1)");
    expect(out).toContain("`reviewId=PRR_1` (@copilot · Unknown): ## PR overview");
    expect(out).toContain("1 actionable");
  });
  it("formatFetchResult renders resolution-only review threads", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [],
      resolutionOnlyThreads: [
        {
          id: "PRT_old",
          isResolved: false,
          isOutdated: true,
          isMinimized: false,
          path: "src/old.ts",
          line: null,
          startLine: null,
          author: "alice",
          authorType: "Unknown" as const,
          body: "old comment",
          url: "",
          createdAtUnix: 0,
        },
      ],
      actionableComments: [],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: true,
      instructions: ["Resolve each thread."],
    });

    await main(["node", "shepherd", "resolve", "42"]);

    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(out).toContain("## Review threads to resolve (1)");
    expect(out).toContain("`threadId=PRT_old`");
    expect(out).toContain("[status: outdated]");
  });
  it("calls runResolveMutate when --resolve-thread-ids is given", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: ["t-1"],
      minimizedComments: [],
      dismissedReviews: [],
      errors: [],
    });
    await main(["node", "shepherd", "resolve", "42", "--resolve-thread-ids", "t-1"]);
    expect(mockRunResolveMutate).toHaveBeenCalledTimes(1);
  });
  it("formatMutateResult renders rate-limit stop and pending IDs", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: [],
      minimizedComments: ["c-1", "c-2"],
      dismissedReviews: [],
      errors: ["rate limit: API rate limit exceeded"],
      rateLimit: {
        message: "API rate limit exceeded",
        retryAfterSeconds: 60,
        remaining: 0,
        limit: 5000,
        resetAt: 1700000000,
      },
      unminimizedComments: ["c-3", "c-4"],
    });

    await main(["node", "shepherd", "resolve", "42", "--minimize-comment-ids", "c-1,c-2,c-3,c-4"]);

    const out = getStdout();
    expect(out).toContain("Minimized comments (2): c-1, c-2");
    expect(out).toContain("Stopped: GitHub rate limit hit");
    expect(out).toContain("retry after 60s");
    expect(out).toContain("reset at 2023-11-14T22:13:20.000Z");
    expect(out).toContain("Not minimized due to rate limit (2): c-3, c-4");
    expect(out).not.toContain("Errors:");
  });
  it("formatMutateResult renders rate-limit stop without optional limit details", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: ["rate limit: secondary limit"],
      rateLimit: { message: "secondary limit" },
    });

    await main(["node", "shepherd", "resolve", "42", "--resolve-thread-ids", "t-1"]);

    const out = getStdout();
    expect(out).toContain("Stopped: GitHub rate limit hit — secondary limit");
    expect(out).not.toContain("retry after");
    expect(out).not.toContain("remaining");
    expect(out).not.toContain("reset at");
  });
});
