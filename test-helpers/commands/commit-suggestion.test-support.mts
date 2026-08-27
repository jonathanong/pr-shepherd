import { vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

const { mockReadFile } = vi.hoisted(() => ({ mockReadFile: vi.fn() }));

vi.mock("../../src/commands/suggestion-patch-git.mts", () => ({
  getLocalHeadSha: async () => (await mockExecFile("git", ["rev-parse", "HEAD"])).stdout.trim(),
  getPathsStatus: async (paths: string[]) =>
    (await mockExecFile("git", ["status", "--porcelain", "--", ...paths])).stdout.trim(),
  isAncestor: async (ancestor: string, descendant: string) => {
    try {
      await mockExecFile("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
      return true;
    } catch {
      return false;
    }
  },
  readPrHeadFile: mockReadFile,
  checkPatchesApply: async (patches: string[]) => {
    await mockExecFile("git", ["apply", "--check"], patches.join("\n"));
  },
}));

vi.mock("../../src/github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42 as number | null),
  getCurrentBranch: vi.fn().mockResolvedValue("feature/foo"),
}));

vi.mock("../../src/github/suggestion-thread.mts", () => ({
  fetchSuggestionThreads: vi.fn(),
}));

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../../src/config/load.mts", () => ({
  loadConfig: mockLoadConfig,
}));

import { runCommitSuggestion } from "../../src/commands/commit-suggestion.mts";
import { getCurrentBranch, getCurrentPrNumber } from "../../src/github/client.mts";
import { fetchSuggestionThreads } from "../../src/github/suggestion-thread.mts";
import type { ReviewThread, BatchPrData } from "../../src/types.mts";

const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockFetchSuggestionThreads = vi.mocked(fetchSuggestionThreads);

const mockFetchBatch = {
  mockResolvedValue(value: { data: BatchPrData; rateLimit?: unknown }): void {
    const data = value.data;
    mockFetchSuggestionThreads.mockImplementation(async (_pr, _repo, threadIds) => ({
      headRefOid: data.headRefOid,
      headRefName: data.headRefName,
      headRepoWithOwner: data.headRepoWithOwner,
      threads: threadIds.map(
        (threadId) => data.reviewThreads.find((thread) => thread.id === threadId) ?? null,
      ),
    }));
  },
};

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
    authorType: "Unknown" as const,
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
    branchProtection: null,
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
  mockReadFile.mockResolvedValue(FILE_CONTENT);

  mockExecFile.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
    if (cmd === "git" && args[0] === "status") return makeGitSuccess(""); // file is clean
    if (cmd === "git" && args[0] === "apply") return makeGitSuccess("");
    throw new Error(`Unexpected execFile call: ${cmd} ${args.join(" ")}`);
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function registerHooks(): void {
  beforeEach(() => {
    mockLoadConfig.mockReturnValue({});
  });
}

export {
  FILE_CONTENT,
  GLOBAL_OPTS,
  fetchSuggestionThreads,
  getCurrentBranch,
  getCurrentPrNumber,
  makeBatch,
  makeGitSuccess,
  makeThread,
  mockExecFile,
  mockFetchBatch,
  mockGetCurrentBranch,
  mockGetCurrentPrNumber,
  mockLoadConfig,
  mockReadFile,
  runCommitSuggestion,
  setupHappyPath,
};
export type { BatchPrData, ReviewThread };
