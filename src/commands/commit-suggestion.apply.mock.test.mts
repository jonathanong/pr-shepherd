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
import { getCurrentBranch } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { readFile } from "node:fs/promises";
import type { ReviewThread, BatchPrData } from "../types.mts";

const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
const mockFetchBatch = vi.mocked(fetchPrBatch);
const mockReadFile = vi.mocked(readFile);

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

// ---------------------------------------------------------------------------
// Output shape and instruction content
// ---------------------------------------------------------------------------

describe("runCommitSuggestion — output shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockReadFile as any).mockResolvedValue(FILE_CONTENT);
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      throw new Error(`Unexpected execFile: ${cmd} ${args.join(" ")}`);
    });
  });

  it("postActionInstructions step 1 mentions the file path and line range", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "rename x",
    });
    expect(result.postActionInstructions[0]).toContain("src/foo.ts");
    expect(result.postActionInstructions[0]).toContain("line 5");
  });

  it("postActionInstructions step 2 stages the exact file", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "rename x",
    });
    expect(result.postActionInstructions[1]).toContain("git add");
    expect(result.postActionInstructions[1]).toContain("src/foo.ts");
  });

  it("postActionInstructions step 3 includes the literal commit message", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "rename x to const",
    });
    expect(result.postActionInstructions[2]).toContain("git commit");
    expect(result.postActionInstructions[2]).toContain("rename x to const");
  });

  it("postActionInstructions step 4 resolves the thread", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.postActionInstructions[3]).toContain("pr-shepherd resolve");
    expect(result.postActionInstructions[3]).toContain("PRRT_x");
  });

  it("postActionInstructions step 5 mentions git push", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.postActionInstructions[4]).toContain("git push");
  });

  it("multi-line range label in step 1 uses em-dash notation", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ line: 7, startLine: 5 })]),
    });
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.postActionInstructions[0]).toContain("lines 5–7");
  });

  it("commitBody contains Co-authored-by with correct author login", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.commitBody).toBe("Co-authored-by: alice <alice@users.noreply.github.com>");
  });

  it("commitBody prepends description before Co-authored-by with blank separator", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
      description: "Reviewer asked to use const.",
    });
    expect(result.commitBody).toBe(
      "Reviewer asked to use const.\n\nCo-authored-by: alice <alice@users.noreply.github.com>",
    );
  });

  it("filesToStage contains only the thread's file path", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.filesToStage).toEqual(["src/foo.ts"]);
  });

  it("patch contains the unified diff with the replacement line", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.patch).toContain("-const x = 1;");
    expect(result.patch).toContain("+const x = 10;");
  });
});
