// @ts-nocheck
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

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({
  loadConfig: mockLoadConfig,
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

export function registerHooks(): void {
  beforeEach(() => {
    mockLoadConfig.mockReturnValue({});
  });
}

export {
  FILE_CONTENT,
  GLOBAL_OPTS,
  fetchPrBatch,
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
  readFile,
  runCommitSuggestion,
  setupHappyPath,
};
export type { BatchPrData, ReviewThread };
