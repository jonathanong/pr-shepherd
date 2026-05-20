import { describe, it, expect } from "vitest";
import { registerHooks, mockRunResolveFetch, stdoutSpy } from "./cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — resolve", () => {
  it("formatFetchResult: thread and comment with url render ↗ link after id", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [
        {
          id: "PRT_linked",
          path: "src/x.ts",
          line: 1,
          startLine: null,
          isMinimized: false,
          author: "alice",
          authorType: "Unknown" as const,
          body: "nit",
          url: "https://github.com/owner/repo/pull/1#discussion_r1",
          createdAtUnix: 0,
          comments: [
            {
              id: "PRRC_thread_1",
              isMinimized: false,
              author: "alice",
              authorType: "Unknown" as const,
              body: "long first body that must not be previewed\nwith another line",
              url: "https://github.com/owner/repo/pull/1#discussion_r1",
              createdAtUnix: 0,
            },
            {
              id: "PRRC_thread_2",
              isMinimized: false,
              author: "carol",
              authorType: "User" as const,
              body: "reply in resolved conversation",
              url: "https://github.com/owner/repo/pull/1#discussion_r2",
              createdAtUnix: 0,
            },
          ],
        },
      ],
      resolutionOnlyThreads: [],
      actionableComments: [
        {
          id: "IC_linked",
          author: "bob",
          authorType: "Unknown" as const,
          body: "fix me",
          isMinimized: false,
          url: "https://github.com/owner/repo/pull/1#issuecomment-1",
          createdAtUnix: 0,
        },
      ],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: false,
      instructions: ["Classify.", "Report."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(out).toContain(
      "`threadId=PRT_linked` [↗](https://github.com/owner/repo/pull/1#discussion_r1)",
    );
    expect(out).toContain(
      "`commentId=PRRC_thread_1` [↗](https://github.com/owner/repo/pull/1#discussion_r1)",
    );
    expect(out).toContain("> long first body that must not be previewed\n    > with another line");
    expect(out).toContain(
      "`commentId=PRRC_thread_2` [↗](https://github.com/owner/repo/pull/1#discussion_r2)",
    );
    expect(out).toContain("> reply in resolved conversation");
    expect(out).toContain(
      "`commentId=IC_linked` [↗](https://github.com/owner/repo/pull/1#issuecomment-1)",
    );
  });
  it("formatFetchResult --format=json includes instructions array", async () => {
    const instructions = ["Classify every item.", "Resolve.", "Report."];
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
      instructions,
    });
    await main(["node", "shepherd", "resolve", "42", "--format=json"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    const parsed = JSON.parse(out) as { instructions: string[] };
    expect(Array.isArray(parsed.instructions)).toBe(true);
    expect(parsed.instructions).toEqual(instructions);
  });
});
