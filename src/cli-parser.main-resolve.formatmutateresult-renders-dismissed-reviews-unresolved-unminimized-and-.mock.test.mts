// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunResolveFetch,
  mockRunResolveMutate,
  stdoutSpy,
} from "./cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — resolve", () => {
  it("formatMutateResult renders dismissed reviews, unresolved, unminimized, and undismissed IDs", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: ["r-1"],
      errors: [],
      unresolvedThreads: ["t-1"],
      unminimizedComments: ["c-1"],
      undismissedReviews: ["r-2"],
    });

    await main([
      "node",
      "shepherd",
      "resolve",
      "42",
      "--dismiss-review-ids",
      "r-1,r-2",
      "--message",
      "done",
    ]);

    const out = getStdout();
    expect(out).toContain("Dismissed reviews (1): r-1");
    expect(out).toContain("Not resolved due to rate limit (1): t-1");
    expect(out).toContain("Not minimized due to rate limit (1): c-1");
    expect(out).toContain("Not dismissed due to rate limit (1): r-2");
  });
  it("formatMutateResult renders skipped dismissals", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: ["r-1"],
      errors: [],
      skippedDismissals: ["r-2", "r-3"],
    });

    await main([
      "node",
      "shepherd",
      "resolve",
      "42",
      "--dismiss-review-ids",
      "r-1,r-2,r-3",
      "--message",
      "done",
    ]);

    const out = getStdout();
    expect(out).toContain("Dismissed reviews (1): r-1");
    expect(out).toContain("Skipped dismissals (2): r-2, r-3");
  });
  it("formatMutateResult renders non-rate-limit errors", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: ["t-1: nope"],
    });

    await main(["node", "shepherd", "resolve", "42", "--resolve-thread-ids", "t-1"]);

    expect(getStdout()).toContain("Errors:\n  t-1: nope");
  });
  it("resolve mutate --format=json includes rate-limit stop and pending IDs", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: ["t-1"],
      minimizedComments: [],
      dismissedReviews: [],
      errors: ["rate limit: secondary rate limit"],
      rateLimit: { message: "secondary rate limit" },
      unresolvedThreads: ["t-2"],
    });

    await main([
      "node",
      "shepherd",
      "resolve",
      "42",
      "--resolve-thread-ids",
      "t-1,t-2",
      "--format=json",
    ]);

    const parsed = JSON.parse(getStdout()) as {
      rateLimit: { message: string };
      unresolvedThreads: string[];
    };
    expect(parsed.rateLimit.message).toBe("secondary rate limit");
    expect(parsed.unresolvedThreads).toEqual(["t-2"]);
  });
  it("formatFetchResult emits H1 heading, Markdown sections, and ## Instructions", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [
        {
          id: "PRT_1",
          path: "src/foo.ts",
          line: 10,
          startLine: null,
          isMinimized: false,
          author: "alice",
          authorType: "Unknown" as const,
          body: "Consider renaming this",
          url: "",
          createdAtUnix: 0,
        },
      ],
      resolutionOnlyThreads: [],
      actionableComments: [
        {
          id: "IC_1",
          author: "bob",
          authorType: "Unknown" as const,
          body: "Typo here",
          isMinimized: false,
          url: "",
          createdAtUnix: 0,
        },
      ],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: false,
      instructions: ["Classify every item.", "Fix items.", "Resolve verified items.", "Report."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");

    expect(out).toContain("# PR #42 — Resolve fetch");
    expect(out).toContain("## Actionable Review Threads");
    expect(out).toContain("## Actionable PR Comments");
    expect(out).toContain("## Instructions");

    // Instructions must be last H2
    const instrIdx = out.indexOf("## Instructions");
    expect(instrIdx).toBeGreaterThan(out.indexOf("## Actionable PR Comments"));

    // Numbered steps rendered
    expect(out).toContain("1. Classify every item.");
    expect(out).toContain("2. Fix items.");
  });
});
