import { vi, beforeEach } from "vitest";

vi.mock("../github/batch.mts", () => ({ fetchPrBatch: vi.fn() }));
vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getMergeableState: vi.fn(),
}));
vi.mock("../checks/triage.mts", () => ({
  triageFailingChecks: vi.fn((checks: unknown[]) => Promise.resolve(checks)),
  fetchStartupFailureChecks: vi.fn().mockResolvedValue([]),
}));
vi.mock("../github/check-annotations.mts", () => ({
  fetchCheckRunAnnotations: vi.fn().mockResolvedValue([]),
}));
vi.mock("../comments/resolve.mts", () => ({
  autoResolveOutdated: vi.fn().mockResolvedValue({ resolved: [], errors: [] }),
}));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return {
    ...actual,
    loadSeenMap: vi.fn().mockResolvedValue(new Map()),
    markSeen: vi.fn().mockResolvedValue(undefined),
  };
});
const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { runCheck } from "./check.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { getCurrentPrNumber, getMergeableState } from "../github/client.mts";
import { fetchStartupFailureChecks, triageFailingChecks } from "../checks/triage.mts";
import { fetchCheckRunAnnotations } from "../github/check-annotations.mts";
import { loadSeenMap, markSeen, hashBody } from "../state/seen-comments.mts";
import { autoResolveOutdated } from "../comments/resolve.mts";
import type { BatchPrData, ClassifiedCheck, ReviewThread, PrComment } from "../types.mts";

const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockGetMergeableState = vi.mocked(getMergeableState);
const mockTriageFailingChecks = vi.mocked(triageFailingChecks);
const mockFetchStartupFailureChecks = vi.mocked(fetchStartupFailureChecks);
const mockFetchCheckRunAnnotations = vi.mocked(fetchCheckRunAnnotations);
const mockLoadSeenMap = vi.mocked(loadSeenMap);
const mockMarkSeen = vi.mocked(markSeen);
const mockAutoResolveOutdated = vi.mocked(autoResolveOutdated);

const BASE_OPTS = { format: "text" as const };

function defaultConfig() {
  return {
    botUsernames: ["coderabbitai"],
    iterate: {
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 60,
      minimizeApprovals: false,
      minimizeComments: "all" as "all" | "bots" | "users" | "none",
    },
    watch: { readyDelayMinutes: 10 },
    resolve: {
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
      fetchReviewSummaries: true,
    },
    checks: {
      ciTriggerEvents: ["pull_request", "pull_request_target"],
    },
    mergeStatus: { blockingReviewerLogins: ["copilot"] },
    actions: {
      autoResolveOutdated: true,
      autoMarkReady: true,
      commitSuggestions: true,
    },
  };
}

function makeCheck(overrides: Partial<ClassifiedCheck> = {}): ClassifiedCheck {
  return {
    id: null,
    name: "tests",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "",
    event: "pull_request",
    runId: null,
    category: "passed",
    ...overrides,
  };
}

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
    branchProtection: null,
    checks: [makeCheck()],
    ...overrides,
  };
}

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "t1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.mts",
    line: 10,
    startLine: null,
    author: "reviewer",
    authorType: "Unknown",
    body: "fix this",
    url: "",
    createdAtUnix: 0,
    ...overrides,
  };
}

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: "c1",
    author: "commenter",
    authorType: "Unknown",
    body: "comment body",
    url: "",
    createdAtUnix: 0,
    isMinimized: false,
    ...overrides,
  };
}

// No PR found

export function registerHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue(defaultConfig());
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    mockGetMergeableState.mockResolvedValue({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" });
    mockFetchStartupFailureChecks.mockResolvedValue([]);
    mockFetchCheckRunAnnotations.mockResolvedValue([]);
  });
}

export {
  BASE_OPTS,
  autoResolveOutdated,
  defaultConfig,
  fetchPrBatch,
  fetchStartupFailureChecks,
  fetchCheckRunAnnotations,
  getCurrentPrNumber,
  getMergeableState,
  hashBody,
  loadSeenMap,
  makeBatchData,
  makeCheck,
  makeComment,
  makeThread,
  markSeen,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockFetchStartupFailureChecks,
  mockFetchCheckRunAnnotations,
  mockGetCurrentPrNumber,
  mockGetMergeableState,
  mockLoadConfig,
  mockLoadSeenMap,
  mockMarkSeen,
  mockTriageFailingChecks,
  runCheck,
  triageFailingChecks,
};
export type { BatchPrData, ClassifiedCheck, PrComment, ReviewThread };
