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
import { getPrHead, getCurrentBranch } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { readFile, unlink } from "node:fs/promises";
import type { ReviewThread, BatchPrData } from "../types.mts";

const mockGetPrHead = vi.mocked(getPrHead);
const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
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

const GLOBAL_OPTS = { format: "text" as const, format: "text" as const };

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
    if (!result.applied) throw new Error("expected applied=true");
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
// Dry-run
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — dry-run", () => {
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

  function setupDryRunHappyPath(): void {
    let revParseCount = 0;
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("");
      if (cmd === "git" && args[0] === "rev-parse") {
        revParseCount++;
        return revParseCount === 1 ? makeGitSuccess("headsha\n") : makeGitSuccess("newsha\n");
      }
      // Only --check is expected; bare apply must not be called.
      if (cmd === "git" && args[0] === "apply" && args.includes("--check")) return makeGitSuccess();
      throw new Error(`Unexpected execFile call: ${cmd} ${args.join(" ")}`);
    });
  }

  it("returns dryRun=true, valid=true, reason=null when patch applies cleanly", async () => {
    setupDryRunHappyPath();
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      dryRun: true,
    });

    expect(result.applied).toBe(false);
    if (!("dryRun" in result) || !result.dryRun) throw new Error("expected dryRun=true");
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.patch).toContain("+const x = 10;");
  });

  it("calls git apply --check but not bare git apply, git add, git commit, or applyResolveOptions", async () => {
    setupDryRunHappyPath();
    await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", dryRun: true });

    const applyCalls = mockExecFile.mock.calls.filter(
      (call) => call[0] === "git" && (call[1] as string[])[0] === "apply",
    );
    // Exactly one --check call; no bare apply
    expect(applyCalls).toHaveLength(1);
    expect((applyCalls[0]![1] as string[]).includes("--check")).toBe(true);

    const addCalls = mockExecFile.mock.calls.filter(
      (call) => call[0] === "git" && (call[1] as string[])[0] === "add",
    );
    expect(addCalls).toHaveLength(0);

    const commitCalls = mockExecFile.mock.calls.filter(
      (call) => call[0] === "git" && (call[1] as string[])[0] === "commit",
    );
    expect(commitCalls).toHaveLength(0);

    expect(mockApplyResolveOptions).not.toHaveBeenCalled();
  });

  it("postActionInstruction mentions re-run when valid", async () => {
    setupDryRunHappyPath();
    const result = await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", dryRun: true });
    expect(result.postActionInstruction).toContain("--dry-run");
  });

  it("returns valid=false with reason when git apply --check fails", async () => {
    let revParseCount = 0;
    const checkErr = Object.assign(new Error("patch failed"), { stderr: "context mismatch" });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("");
      if (cmd === "git" && args[0] === "rev-parse") {
        revParseCount++;
        return revParseCount === 1 ? makeGitSuccess("headsha\n") : makeGitSuccess("newsha\n");
      }
      if (cmd === "git" && args[0] === "apply" && args.includes("--check"))
        return Promise.reject(checkErr);
      throw new Error(`Unexpected execFile call: ${cmd} ${args.join(" ")}`);
    });

    const result = await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", dryRun: true });
    if (!("dryRun" in result) || !result.dryRun) throw new Error("expected dryRun=true");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("context mismatch");
    expect(mockApplyResolveOptions).not.toHaveBeenCalled();
  });

  it("works without --message being set", async () => {
    setupDryRunHappyPath();
    // Should not throw even though message is undefined
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", dryRun: true }),
    ).resolves.toBeDefined();
  });
});
