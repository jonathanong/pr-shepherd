// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, getStdout, mockRunResolveFetch } from "./cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — resolve first-look rendering", () => {
  it("formatFetchResult renders ## First-look items section", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [],
      resolutionOnlyThreads: [],
      actionableComments: [],
      firstLookThreads: [
        {
          id: "PRRT_fl1",
          isResolved: true,
          isOutdated: false,
          isMinimized: false,
          path: "src/foo.ts",
          line: 5,
          startLine: null,
          author: "alice",
          authorType: "Unknown" as const,
          body: "already fixed",
          url: "",
          createdAtUnix: 0,
          firstLookStatus: "resolved" as const,
        },
      ],
      firstLookComments: [
        {
          id: "PRRC_fl2",
          isMinimized: true,
          author: "bot",
          authorType: "Unknown" as const,
          body: "quota warning",
          url: "",
          createdAtUnix: 0,
          firstLookStatus: "minimized" as const,
        },
      ],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: false,
      instructions: ["Acknowledge first-look items."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = getStdout();
    expect(out).toContain("## First-look items (2) — acknowledge status before acting");
    expect(out).toContain("`threadId=PRRT_fl1`");
    expect(out).toContain("[status: resolved]");
    expect(out).toContain("`commentId=PRRC_fl2`");
    expect(out).toContain("[status: minimized]");
  });
});
