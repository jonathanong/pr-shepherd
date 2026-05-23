import { vi, beforeEach } from "vitest";

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));

vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return {
    ...actual,
    loadSeenMap: vi.fn().mockResolvedValue(new Map()),
    markSeen: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../github/batch.mts", () => ({
  fetchPrBatch: vi.fn(),
}));

vi.mock("../comments/resolve.mts", () => ({
  autoResolveOutdated: vi.fn(),
  applyResolveOptions: vi.fn(),
}));

vi.mock("../config/load.mts", () => ({
  loadConfig: vi.fn().mockReturnValue({
    resolve: {
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
      fetchReviewSummaries: true,
    },
    actions: {
      autoResolveOutdated: true,
      autoMarkReady: true,
      commitSuggestions: true,
    },
  }),
}));

import { runResolveFetch, runResolveMutate } from "./resolve.mts";
import { getCurrentPrNumber } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { autoResolveOutdated, applyResolveOptions } from "../comments/resolve.mts";
import { loadConfig } from "../config/load.mts";
import { loadSeenMap, markSeen, hashBody } from "../state/seen-comments.mts";
import type { BatchPrData, ReviewThread, PrComment } from "../types.mts";

const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockAutoResolveOutdated = vi.mocked(autoResolveOutdated);
const mockApplyResolveOptions = vi.mocked(applyResolveOptions);
const mockLoadConfig = vi.mocked(loadConfig);
const mockLoadSeenMap = vi.mocked(loadSeenMap);
const mockMarkSeen = vi.mocked(markSeen);

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
  mockApplyResolveOptions,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockGetCurrentPrNumber,
  mockLoadConfig,
  mockLoadSeenMap,
  mockMarkSeen,
  runResolveFetch,
  runResolveMutate,
};
export type { BatchPrData, PrComment, ReviewThread };
