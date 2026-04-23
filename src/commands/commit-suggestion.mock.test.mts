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
  getPrHead: vi
    .fn()
    .mockResolvedValue({ sha: "headsha", ref: "feature/foo", repoWithOwner: "owner/repo" }),
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
import { getPrHead, getCurrentBranch, getCurrentPrNumber } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { readFile, unlink } from "node:fs/promises";
import type { ReviewThread, BatchPrData } from "../types.mts";

const mockGetPrHead = vi.mocked(getPrHead);
const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockFetchBatch = vi.mocked(fetchPrBatch);
const mockApplyResolveOptions = vi.mocked(applyResolveOptions);
const mockReadFile = vi.mocked(readFile);
const mockUnlink = vi.mocked(unlink);

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

const GLOBAL_OPTS = { format: "text" as const, noCache: false, cacheTtlSeconds: 300 };

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
    mockGetPrHead.mockResolvedValue({
      sha: "headsha",
      ref: "feature/foo",
      repoWithOwner: "owner/repo",
    });
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
    mockGetPrHead.mockResolvedValue({
      sha: "headsha",
      ref: "feature/foo",
      repoWithOwner: "owner/repo",
    });
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
    mockGetPrHead.mockResolvedValue({
      sha: "headsha",
      ref: "feature/foo",
      repoWithOwner: "owner/repo",
    });
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
// Successful apply
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — successful apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPrHead.mockResolvedValue({
      sha: "headsha",
      ref: "feature/foo",
      repoWithOwner: "owner/repo",
    });
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    setupHappyPath();
  });

  it("returns applied=true with commitSha and patch on success", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "apply suggestion",
    });
    expect(result.applied).toBe(true);
    expect(result.commitSha).toBe("newsha");
    expect(result.threadId).toBe("PRRT_x");
    expect(result.author).toBe("alice");
    expect(result.path).toBe("src/foo.ts");
    expect(result.patch).toContain("--- a/src/foo.ts");
    expect(result.patch).toContain("+const x = 10;");
  });

  it("runs git apply --check then git apply", async () => {
    await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" });

    const applyCalls = mockExecFile.mock.calls.filter(
      (call) => call[0] === "git" && (call[1] as string[])[0] === "apply",
    );
    expect(applyCalls).toHaveLength(2);
    expect(applyCalls[0]![1]).toContain("--check");
    expect(applyCalls[1]![1]).not.toContain("--check");
  });

  it("commits with Co-authored-by trailer in body when --description omitted", async () => {
    await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "apply suggestion" });

    const commitCall = mockExecFile.mock.calls.find(
      (call) => call[0] === "git" && (call[1] as string[])[0] === "commit",
    );
    expect(commitCall).toBeDefined();
    const argv = commitCall![1] as string[];
    // -m <headline> -m <body>
    const headlineIdx = argv.indexOf("-m");
    const bodyIdx = argv.indexOf("-m", headlineIdx + 2);
    expect(argv[headlineIdx + 1]).toBe("apply suggestion");
    expect(argv[bodyIdx + 1]).toContain("Co-authored-by: alice <alice@users.noreply.github.com>");
  });

  it("prepends --description to commit body before Co-authored-by", async () => {
    await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "apply suggestion",
      description: "Reviewer asked to use const.",
    });

    const commitCall = mockExecFile.mock.calls.find(
      (call) => call[0] === "git" && (call[1] as string[])[0] === "commit",
    );
    const argv = commitCall![1] as string[];
    const headlineIdx = argv.indexOf("-m");
    const bodyIdx = argv.indexOf("-m", headlineIdx + 2);
    const body = argv[bodyIdx + 1]!;
    expect(body).toContain("Reviewer asked to use const.");
    expect(body).toContain("Co-authored-by: alice");
    // Description comes before Co-authored-by
    expect(body.indexOf("Reviewer")).toBeLessThan(body.indexOf("Co-authored-by"));
  });

  it("resolves the thread on GitHub after committing", async () => {
    await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      { resolveThreadIds: ["PRRT_x"] },
    );
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

  it("postActionInstruction mentions git push", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.postActionInstruction).toContain("git push");
  });

  it("succeeds even when temp patch file unlink fails", async () => {
    mockUnlink.mockRejectedValueOnce(new Error("ENOENT: unlink failed"));
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.applied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Patch application failure
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — file read failure", () => {
  it("throws with descriptive message when file cannot be read", async () => {
    vi.clearAllMocks();
    mockGetPrHead.mockResolvedValue({
      sha: "headsha",
      ref: "feature/foo",
      repoWithOwner: "owner/repo",
    });
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
    ).rejects.toThrow("Could not read src/foo.ts");
  });

  it("uses String(err) when readFile throws a non-Error value", async () => {
    vi.clearAllMocks();
    mockGetPrHead.mockResolvedValue({
      sha: "headsha",
      ref: "feature/foo",
      repoWithOwner: "owner/repo",
    });
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
    ).rejects.toThrow("Could not read src/foo.ts: plain string error");
  });
});

describe("runCommitSuggestion — patch failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPrHead.mockResolvedValue({
      sha: "headsha",
      ref: "feature/foo",
      repoWithOwner: "owner/repo",
    });
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

// ---------------------------------------------------------------------------
// Resolve failure after commit
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — resolve failure", () => {
  it("throws (with commit SHA in message) when resolve fails after commit lands", async () => {
    vi.clearAllMocks();
    mockGetPrHead.mockResolvedValue({
      sha: "headsha",
      ref: "feature/foo",
      repoWithOwner: "owner/repo",
    });
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    setupHappyPath();
    mockApplyResolveOptions.mockResolvedValue({
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: ["could not resolve PRRT_x"],
    });

    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow(/Commit created \(newsha\).*could not resolve/);
  });
});
