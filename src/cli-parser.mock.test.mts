import { readFileSync } from "node:fs";

/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("./commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
import { main } from "./cli-parser.mts";
import { runResolveFetch, runResolveMutate } from "./commands/resolve.mts";

const mockRunResolveFetch = vi.mocked(runResolveFetch);
const mockRunResolveMutate = vi.mocked(runResolveMutate);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// resolve dispatch
// ---------------------------------------------------------------------------

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
        "For each Actionable thread marked `[suggestion]`: run `npx pr-shepherd commit-suggestion 42 ...`",
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

// ---------------------------------------------------------------------------
// unknown subcommand
// ---------------------------------------------------------------------------

describe("main — unknown subcommand", () => {
  it("writes error to stderr and exits 1", async () => {
    await main(["node", "shepherd", "unknown-command"]);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(stderrOutput).toContain("Unknown subcommand");
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// --version / -v
// ---------------------------------------------------------------------------

describe("main — --version", () => {
  const pkgVersion = (
    JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    }
  ).version;

  it("prints the exact package.json version followed by a newline for --version", async () => {
    await main(["node", "shepherd", "--version"]);
    expect(getStdout()).toBe(`${pkgVersion}\n`);
    expect(process.exitCode).toBeUndefined();
  });

  it("also accepts -v with identical output", async () => {
    await main(["node", "shepherd", "-v"]);
    expect(getStdout()).toBe(`${pkgVersion}\n`);
    expect(process.exitCode).toBeUndefined();
  });
});

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
