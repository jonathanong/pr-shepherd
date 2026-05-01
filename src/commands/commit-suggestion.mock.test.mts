import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    optsOrCb:
      | Record<string, unknown>
      | ((err: Error | null, result: { stdout: string; stderr: string }) => void),
    maybeCb?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb!;
    mockExecFile(cmd, args)
      .then((result: { stdout: string; stderr: string }) => cb(null, result))
      .catch((err: Error & { stderr?: string }) =>
        cb(err, { stdout: "", stderr: err.stderr ?? "" }),
      );
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42 as number | null),
  getCurrentBranch: vi.fn().mockResolvedValue("feature/foo"),
}));

vi.mock("../github/batch.mts", () => ({
  fetchPrBatch: vi.fn(),
}));

import { runCommitSuggestion } from "./commit-suggestion.mts";
import { getCurrentBranch, getCurrentPrNumber } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { readFile } from "node:fs/promises";
import type { ReviewThread, BatchPrData } from "../types.mts";

const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockFetchBatch = vi.mocked(fetchPrBatch);
const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "PRRT_x",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.ts",
    line: 5,
    startLine: null,
    author: "alice",
    body: "Use a const here.\n\n```suggestion\nconst x = 10;\n```",
    url: "",
    createdAtUnix: 0,
    ...overrides,
  };
}

function makeBatch(
  threads: ReviewThread[],
  headRepoWithOwner: string | null = "owner/repo",
): BatchPrData {
  return {
    nodeId: "PR_kgDOAAA",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "headsha",
    headRefName: "feature/foo",
    headRepoWithOwner,
    baseRefName: "main",
    reviewRequests: [],
    latestReviews: [],
    reviewThreads: threads,
    checks: [],
    comments: [],
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
  };
}

const FILE_CONTENT =
  "line1\n" +
  "line2\n" +
  "line3\n" +
  "line4\n" +
  "const x = 1;\n" + // line 5 — matches the suggestion anchor
  "line6\n" +
  "line7\n";

const GLOBAL_OPTS = { format: "text" as const };

function makeGitSuccess(stdout = ""): Promise<{ stdout: string; stderr: string }> {
  return Promise.resolve({ stdout, stderr: "" });
}

function setupHappyPath(): void {
  mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockReadFile as any).mockResolvedValue(FILE_CONTENT);

  mockExecFile.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
    if (cmd === "git" && args[0] === "status") return makeGitSuccess(""); // file is clean
    throw new Error(`Unexpected execFile call: ${cmd} ${args.join(" ")}`);
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
    mockExecFile.mockImplementation(() => makeGitSuccess(""));
  });

  it("throws when --thread-id is empty", async () => {
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "", message: "fix" }),
    ).rejects.toThrow("--thread-id is required");
  });

  it("throws when --message is empty", async () => {
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "" }),
    ).rejects.toThrow("--message is required");
  });

  it("throws when --message is whitespace only", async () => {
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "   " }),
    ).rejects.toThrow("--message is required");
  });
});

// ---------------------------------------------------------------------------
// Preflight checks
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
  });

  it("throws when no open PR is found for current branch", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    mockExecFile.mockImplementation(() => makeGitSuccess(""));
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("No open PR found");
  });

  it("throws when current branch does not match PR head ref", async () => {
    mockGetCurrentBranch.mockResolvedValue("wrong-branch");
    mockExecFile.mockImplementation(() => makeGitSuccess("headsha\n"));
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow('does not match PR head branch "feature/foo"');
  });

  it("throws when local HEAD SHA does not match PR head SHA", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("divergedsha\n");
      return makeGitSuccess("");
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("does not match PR head headsha");
  });

  it("throws when head repository is unavailable (deleted fork)", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread()], null),
    });
    mockExecFile.mockImplementation(() => makeGitSuccess("headsha\n"));
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("head repository is unavailable");
  });

  it("throws when the target file has uncommitted local changes", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("M src/foo.ts\n");
      return makeGitSuccess("");
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("uncommitted changes");
  });
});

// ---------------------------------------------------------------------------
// Thread classification — hard errors
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — thread classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      return makeGitSuccess("");
    });
  });

  it("throws when thread not found on PR", async () => {
    mockFetchBatch.mockResolvedValue({ data: makeBatch([]) });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_missing", message: "fix" }),
    ).rejects.toThrow("not found on PR");
  });

  it("throws when thread is already resolved", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "PRRT_x", isResolved: true })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("already resolved");
  });

  it("throws when thread is outdated", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "PRRT_x", isOutdated: true })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("outdated");
  });

  it("throws when thread is minimized", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "PRRT_x", isMinimized: true })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("minimized");
  });

  it("throws when thread has no file/line anchor", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "PRRT_x", path: null, line: null })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("no file/line anchor");
  });

  it("throws when thread has no suggestion block", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ body: "just a comment, no suggestion" })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("no suggestion block");
  });

  it("throws when suggestion has nested fencing (isCommittableSuggestion guard)", async () => {
    const body = "```suggestion\ntext ```suggestion nested\n```";
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ body })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("nested suggestion fencing");
  });
});

// ---------------------------------------------------------------------------
// File read failure
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — file read failure", () => {
  it("propagates the underlying readFile error when file cannot be read", async () => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      return makeGitSuccess("");
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockReadFile as any).mockRejectedValue(
      Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" }),
    );

    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("ENOENT");
  });
});

// ---------------------------------------------------------------------------
// Happy path — pure suggestion (no git mutations)
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    setupHappyPath();
  });

  it("returns patch, commitMessage, commitBody, filesToStage, postActionInstructions", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "apply suggestion",
    });
    expect(result.patch).toContain("--- a/src/foo.ts");
    expect(result.patch).toContain("+const x = 10;");
    expect(result.commitMessage).toBe("apply suggestion");
    expect(result.commitBody).toContain("Co-authored-by: alice <alice@users.noreply.github.com>");
    expect(result.filesToStage).toEqual(["src/foo.ts"]);
    expect(result.postActionInstructions).toHaveLength(5);
    expect(result.threadId).toBe("PRRT_x");
    expect(result.author).toBe("alice");
    expect(result.path).toBe("src/foo.ts");
    expect(result.pr).toBe(42);
    expect(result.repo).toBe("owner/repo");
  });

  it("never calls git apply, git add, or git commit", async () => {
    await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" });

    const mutatingCalls = mockExecFile.mock.calls.filter(
      (call) =>
        call[0] === "git" &&
        ["apply", "add", "commit", "checkout"].includes((call[1] as string[])[0] ?? ""),
    );
    expect(mutatingCalls).toHaveLength(0);
  });

  it("prepends --description to commitBody before Co-authored-by", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "apply suggestion",
      description: "Reviewer asked to use const.",
    });
    expect(result.commitBody).toContain("Reviewer asked to use const.");
    expect(result.commitBody).toContain("Co-authored-by: alice");
    expect(result.commitBody.indexOf("Reviewer")).toBeLessThan(
      result.commitBody.indexOf("Co-authored-by"),
    );
  });

  it("postActionInstructions include git add, git commit, and pr-shepherd resolve steps", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    const joined = result.postActionInstructions.join("\n");
    expect(joined).toContain("git add");
    expect(joined).toContain("git commit");
    expect(joined).toContain("pr-shepherd resolve");
    expect(joined).toContain("git push");
  });

  it("multi-line range: uses startLine from thread", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([
        makeThread({
          line: 6,
          startLine: 4,
          body: "```suggestion\nreplacement1\nreplacement2\nreplacement3\n```",
        }),
      ]),
    });

    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.startLine).toBe(4);
    expect(result.endLine).toBe(6);
  });
});
