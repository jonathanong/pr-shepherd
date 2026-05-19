import { describe, it, expect } from "vitest";
import { registerHooks, mockRunResolveFetch, stdoutSpy } from "./cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — resolve", () => {
  it("formatFetchResult includes commit-suggestion step when enabled and suggestion present", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [
        {
          id: "PRT_1",
          path: "src/foo.ts",
          line: 5,
          startLine: null,
          isMinimized: false,
          author: "alice",
          authorType: "Unknown" as const,
          body: "Use const",
          url: "",
          createdAtUnix: 0,
          suggestion: { startLine: 5, endLine: 5, lines: ["const x = 1;"], author: "alice" },
        },
      ],
      resolutionOnlyThreads: [],
      actionableComments: [],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: true,
      instructions: [
        "Classify every item.",
        "For each Actionable thread marked `[suggestion]`: run `pr-shepherd commit-suggestion 42 ...`",
        "Fix items.",
        "Commit and push.",
        "Resolve.",
        "Report.",
      ],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(out).toContain("commit-suggestion");
  });
  it("formatFetchResult -- zero items emits single-step instructions", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [],
      resolutionOnlyThreads: [],
      actionableComments: [],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: false,
      instructions: ["No actionable items — end this invocation."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. No actionable items — end this invocation.");
  });
  it("formatFetchResult renders changesRequestedReviews section and null path/line fallbacks", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [
        {
          id: "PRT_null",
          path: null,
          line: null,
          startLine: null,
          isMinimized: false,
          author: "alice",
          authorType: "Unknown" as const,
          body: "no location",
          url: "",
          createdAtUnix: 0,
        },
      ],
      resolutionOnlyThreads: [],
      actionableComments: [
        {
          id: "IC_2",
          author: "bob",
          authorType: "Unknown" as const,
          body: "comment",
          isMinimized: false,
          url: "",
          createdAtUnix: 0,
        },
      ],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [
        { id: "PRR_r1", author: "carol", authorType: "Unknown" as const, body: "needs work" },
      ],
      reviewSummaries: [],
      commitSuggestionsEnabled: false,
      instructions: ["Classify every item.", "Fix items.", "Resolve.", "Report."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(out).toContain("## Pending CHANGES_REQUESTED reviews (1)");
    expect(out).toContain("`reviewId=PRR_r1` (@carol · Unknown)");
    // null path renders as (no location)
    expect(out).toContain("`(no location)`");
  });
});
