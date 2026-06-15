import { vi, beforeEach } from "vitest";

vi.mock("../../src/github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));

vi.mock("../../src/state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/state/seen-comments.mts")>();
  return {
    ...actual,
    loadSeenMap: vi.fn().mockResolvedValue(new Map()),
    markSeen: vi.fn().mockResolvedValue(undefined),
    markReplySeen: vi.fn().mockResolvedValue(undefined),
    markReviewInlineThreads: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../src/github/batch.mts", () => ({
  fetchPrBatch: vi.fn(),
}));

vi.mock("../../src/comments/resolve.mts", () => ({
  autoResolveOutdated: vi.fn(),
  applyResolveOptions: vi.fn(),
}));

vi.mock("../../src/config/load.mts", () => ({
  loadConfig: vi.fn().mockReturnValue({
    botUsernames: ["coderabbitai"],
    resolve: {
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
    },
    actions: {
      autoResolveOutdated: true,
      autoMinimizeSuppressed: true,
      autoMarkReady: true,
      commitSuggestions: true,
      neverCancelRuns: [],
    },
  }),
}));

import { runResolveMutate } from "../../src/commands/resolve.mts";
import { getCurrentPrNumber } from "../../src/github/client.mts";
import { fetchPrBatch } from "../../src/github/batch.mts";
import { autoResolveOutdated, applyResolveOptions } from "../../src/comments/resolve.mts";
import { loadConfig } from "../../src/config/load.mts";
import {
  loadSeenMap,
  markSeen,
  markReplySeen,
  markReviewInlineThreads,
  hashBody,
} from "../../src/state/seen-comments.mts";
import type { BatchPrData, ReviewThread, PrComment } from "../../src/types.mts";

const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockAutoResolveOutdated = vi.mocked(autoResolveOutdated);
const mockApplyResolveOptions = vi.mocked(applyResolveOptions);
const mockLoadConfig = vi.mocked(loadConfig);
const mockLoadSeenMap = vi.mocked(loadSeenMap);
const mockMarkSeen = vi.mocked(markSeen);
const mockMarkReplySeen = vi.mocked(markReplySeen);
const mockMarkReviewInlineThreads = vi.mocked(markReviewInlineThreads);

const BASE_OPTS = { format: "text" as const };

function makeBatchData(overrides: Partial<BatchPrData> = {}): BatchPrData {
  return {
    nodeId: "PR_kgDOAAA",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "abc123",
    headRefName: "feature",
    headRepoWithOwner: "owner/repo",
    baseRefName: "main",
    reviewRequests: [],
    latestReviews: [],
    reviewThreads: [],
    comments: [],
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    checks: [],
    branchProtection: null,
    ...overrides,
  };
}

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "t-1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.ts",
    line: 1,
    startLine: null,
    author: "alice",
    authorType: "Unknown" as const,
    body: "fix this",
    url: "",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: "c-1",
    isMinimized: false,
    author: "bob",
    authorType: "Unknown" as const,
    body: "nit",
    url: "",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

export function registerHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: [], errors: [] });
    mockApplyResolveOptions.mockResolvedValue({
      repliedThreads: [],
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: [],
    });
  });
}

export {
  BASE_OPTS,
  applyResolveOptions,
  autoResolveOutdated,
  fetchPrBatch,
  getCurrentPrNumber,
  hashBody,
  loadConfig,
  loadSeenMap,
  makeBatchData,
  makeComment,
  makeThread,
  markSeen,
  markReplySeen,
  markReviewInlineThreads,
  mockApplyResolveOptions,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockGetCurrentPrNumber,
  mockLoadConfig,
  mockLoadSeenMap,
  mockMarkSeen,
  mockMarkReplySeen,
  mockMarkReviewInlineThreads,
  runResolveMutate,
};
export type { BatchPrData, PrComment, ReviewThread };
