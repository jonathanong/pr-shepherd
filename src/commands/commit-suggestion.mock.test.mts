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
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42 as number | null),
  getCurrentBranch: vi.fn().mockResolvedValue("feature/foo"),
}));

vi.mock("../github/batch.mts", () => ({
  fetchPrBatch: vi.fn(),
}));

vi.mock("../comments/resolve.mts", () => ({
  applyResolveOptions: vi.fn().mockResolvedValue({
    resolvedThreads: ["PRRT_x"],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  }),
}));

import { runCommitSuggestion } from "./commit-suggestion.mts";
import { getCurrentBranch, getCurrentPrNumber } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { readFile } from "node:fs/promises";
import type { ReviewThread, BatchPrData } from "../types.mts";

const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockFetchBatch = vi.mocked(fetchPrBatch);
const mockApplyResolveOptions = vi.mocked(applyResolveOptions);
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

function makeBatch(threads: ReviewThread[]): BatchPrData {
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
    headRepoWithOwner: "owner/repo",
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

  // Two rev-parse HEAD calls: preflight (must match head.sha="headsha") then post-commit.
  let revParseCount = 0;
  mockExecFile.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "status") return makeGitSuccess("");
    if (cmd === "git" && args[0] === "rev-parse") {
      revParseCount++;
      return revParseCount === 1 ? makeGitSuccess("headsha\n") : makeGitSuccess("newsha\n");
    }
    if (cmd === "git" && args[0] === "apply") return makeGitSuccess();
    if (cmd === "git" && args[0] === "add") return makeGitSuccess();
    if (cmd === "git" && args[0] === "commit") return makeGitSuccess();
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

  it("throws when worktree is dirty", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("M src/foo.ts\n");
      return makeGitSuccess("");
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("uncommitted changes");
  });

  it("throws when current branch does not match PR head ref", async () => {
    mockGetCurrentBranch.mockResolvedValue("wrong-branch");
    mockExecFile.mockImplementation(() => makeGitSuccess(""));
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow('does not match PR head branch "feature/foo"');
  });

  it("throws when local HEAD SHA does not match PR head SHA", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("");
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("divergedsha\n");
      return makeGitSuccess("");
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("does not match PR head headsha");
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

  it("propagates a non-Error rejection from readFile", async () => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      return makeGitSuccess("");
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockReadFile as any).mockRejectedValue("plain string error");

    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("plain string error");
  });
});

describe("runCommitSuggestion — patch failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockReadFile as any).mockResolvedValue(FILE_CONTENT);
  });

  it("returns applied=false with reason and patch when git apply --check fails", async () => {
    const applyError = Object.assign(new Error("apply failed"), {
      stderr: "error: patch failed: src/foo.ts:5\nerror: src/foo.ts: patch does not apply",
    });

    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("");
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      if (cmd === "git" && args[0] === "apply" && args.includes("--check")) {
        return Promise.reject(applyError);
      }
      return makeGitSuccess("");
    });

    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });

    expect(result.applied).toBe(false);
    if (result.applied) throw new Error("expected applied=false");
    expect(result.reason).toContain("git apply rejected");
    expect(result.reason).toContain("patch does not apply");
    expect(result.patch).toContain("--- a/src/foo.ts");
  });

  it("uses String(err) as reason when apply error has no stderr", async () => {
    const applyError = new Error("apply: context did not match");

    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("");
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      if (cmd === "git" && args[0] === "apply" && args.includes("--check")) {
        return Promise.reject(applyError);
      }
      return makeGitSuccess("");
    });

    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });

    expect(result.applied).toBe(false);
    if (result.applied) throw new Error("expected applied=false");
    expect(result.reason).toContain("apply: context did not match");
  });

  it("does not call git commit when patch fails", async () => {
    const applyError = Object.assign(new Error("apply failed"), { stderr: "context mismatch" });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("");
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      if (cmd === "git" && args[0] === "apply" && args.includes("--check")) {
        return Promise.reject(applyError);
      }
      return makeGitSuccess("");
    });

    await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" });

    const commitCall = mockExecFile.mock.calls.find(
      (call) => call[0] === "git" && (call[1] as string[])[0] === "commit",
    );
    expect(commitCall).toBeUndefined();
  });

  it("does not call applyResolveOptions when patch fails", async () => {
    const applyError = Object.assign(new Error("apply failed"), { stderr: "context mismatch" });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("");
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      if (cmd === "git" && args[0] === "apply" && args.includes("--check")) {
        return Promise.reject(applyError);
      }
      return makeGitSuccess("");
    });

    await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" });
    expect(mockApplyResolveOptions).not.toHaveBeenCalled();
  });
});

describe("runCommitSuggestion — resolve failure", () => {
  it("returns applied:true with error in postActionInstruction when resolve fails after commit", async () => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    setupHappyPath();
    mockApplyResolveOptions.mockResolvedValue({
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: ["could not resolve PRRT_x"],
    });

    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.applied).toBe(true);
    if (result.applied) {
      expect(result.commitSha).toBe("newsha");
      expect(result.postActionInstruction).toMatch(/Commit created \(newsha\)/);
      expect(result.postActionInstruction).toMatch(/could not resolve/);
    }
  });
});
