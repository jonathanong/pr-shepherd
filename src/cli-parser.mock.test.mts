import { readFileSync } from "node:fs";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("./commands/iterate.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/status.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/status.mts")>();
  return {
    ...actual,
    runStatus: vi.fn(),
    formatStatusTable: vi.fn().mockReturnValue("status table"),
  };
});
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runCheck } from "./commands/check.mts";
import { runResolveFetch, runResolveMutate } from "./commands/resolve.mts";
import { runStatus } from "./commands/status.mts";
import type { ShepherdReport } from "./types.mts";

const mockRunCheck = vi.mocked(runCheck);
const mockRunResolveFetch = vi.mocked(runResolveFetch);
const mockRunResolveMutate = vi.mocked(runResolveMutate);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_kgDOAAA",
    repo: "owner/repo",
    status: "READY",
    baseBranch: "main",
    mergeStatus: {
      status: "CLEAN",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: "APPROVED",
      copilotReviewInProgress: false,
      mergeStateStatus: "CLEAN",
    },
    checks: {
      passing: [],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [], firstLook: [] },
    comments: { actionable: [], firstLook: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    firstLookSummaries: [],
    editedSummaries: [],
    approvedReviews: [],
    ...overrides,
  };
}

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockRunStatus.mockResolvedValue([]);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// check dispatch
// ---------------------------------------------------------------------------

describe("main — check", () => {
  it("calls runCheck and exits with statusToExitCode(READY)=0", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ status: "READY" }));
    await main(["node", "shepherd", "check", "42"]);
    expect(mockRunCheck).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  it("exits with code 1 for FAILING status", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ status: "FAILING" }));
    await main(["node", "shepherd", "check", "42"]);
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolve dispatch
// ---------------------------------------------------------------------------

describe("main — resolve", () => {
  it("calls runResolveFetch when no mutation flags are given (fetch mode)", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [],
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
      actionableComments: [],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [{ id: "PRR_1", author: "copilot", body: "## PR overview\nsome detail" }],
      commitSuggestionsEnabled: true,
      instructions: ["Classify every item."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(out).toContain("## Review summaries (1)");
    expect(out).toContain("`reviewId=PRR_1` (@copilot): ## PR overview");
    expect(out).toContain("1 actionable");
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
          body: "Consider renaming this",
          url: "",
          createdAtUnix: 0,
        },
      ],
      actionableComments: [
        {
          id: "IC_1",
          author: "bob",
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
          body: "Use const",
          url: "",
          createdAtUnix: 0,
          suggestion: { startLine: 5, endLine: 5, lines: ["const x = 1;"], author: "alice" },
        },
      ],
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
          body: "no location",
          url: "",
          createdAtUnix: 0,
        },
      ],
      actionableComments: [
        {
          id: "IC_2",
          author: "bob",
          body: "comment",
          isMinimized: false,
          url: "",
          createdAtUnix: 0,
        },
      ],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [{ id: "PRR_r1", author: "carol", body: "needs work" }],
      reviewSummaries: [],
      commitSuggestionsEnabled: false,
      instructions: ["Classify every item.", "Fix items.", "Resolve.", "Report."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(out).toContain("## Pending CHANGES_REQUESTED reviews (1)");
    expect(out).toContain("`reviewId=PRR_r1` (@carol)");
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
          body: "nit",
          url: "https://github.com/owner/repo/pull/1#discussion_r1",
          createdAtUnix: 0,
        },
      ],
      actionableComments: [
        {
          id: "IC_linked",
          author: "bob",
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
// status dispatch
// ---------------------------------------------------------------------------

describe("main — status", () => {
  it("writes usage to stderr and exits 1 when no PR numbers given", async () => {
    await main(["node", "shepherd", "status"]);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(stderrOutput).toContain("Usage");
    expect(process.exitCode).toBe(1);
  });

  it("calls runStatus and exits 0 when all PRs are ready", async () => {
    mockRunStatus.mockResolvedValue([
      {
        number: 1,
        title: "Test",
        state: "OPEN",
        isDraft: false,
        mergeStateStatus: "CLEAN",
        reviewDecision: "APPROVED",
        unresolvedThreads: 0,
        ciState: "SUCCESS",
        threadsTruncated: false,
      },
    ]);
    await main(["node", "shepherd", "status", "1"]);
    expect(mockRunStatus).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
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
    expect(out).toContain("## First-look items (2) — already closed on GitHub; acknowledge only");
    expect(out).toContain("`threadId=PRRT_fl1`");
    expect(out).toContain("[status: resolved]");
    expect(out).toContain("`commentId=PRRC_fl2`");
    expect(out).toContain("[status: minimized]");
  });
});
