import { vi, beforeEach } from "vitest";

vi.mock("../../src/github/batch.mts", () => ({ fetchPrBatch: vi.fn() }));
vi.mock("../../src/github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getMergeableState: vi.fn(),
}));
vi.mock("../../src/checks/triage.mts", () => ({
  triageFailingChecks: vi.fn((checks: unknown[]) => Promise.resolve(checks)),
  fetchStartupFailureChecks: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/github/check-annotations.mts", () => ({
  fetchCheckRunAnnotations: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/comments/resolve.mts", () => ({
  autoResolveOutdated: vi.fn().mockResolvedValue({ resolved: [], errors: [] }),
}));
vi.mock("../../src/state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/state/seen-comments.mts")>();
  return {
    ...actual,
    loadSeenMap: vi.fn().mockResolvedValue(new Map()),
    markSeen: vi.fn().mockResolvedValue(undefined),
    markReviewInlineThreads: vi.fn().mockResolvedValue(undefined),
  };
});
const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../../src/config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { runCheck } from "../../src/commands/check.mts";
import { fetchPrBatch } from "../../src/github/batch.mts";
import { getCurrentPrNumber, getMergeableState } from "../../src/github/client.mts";
import { fetchStartupFailureChecks, triageFailingChecks } from "../../src/checks/triage.mts";
import { fetchCheckRunAnnotations } from "../../src/github/check-annotations.mts";
import {
  loadSeenMap,
  markSeen,
  markReviewInlineThreads,
  hashBody,
} from "../../src/state/seen-comments.mts";
import { autoResolveOutdated } from "../../src/comments/resolve.mts";
import type { BatchPrData, ClassifiedCheck, ReviewThread, PrComment } from "../../src/types.mts";

const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockGetMergeableState = vi.mocked(getMergeableState);
const mockTriageFailingChecks = vi.mocked(triageFailingChecks);
const mockFetchStartupFailureChecks = vi.mocked(fetchStartupFailureChecks);
const mockFetchCheckRunAnnotations = vi.mocked(fetchCheckRunAnnotations);
const mockLoadSeenMap = vi.mocked(loadSeenMap);
const mockMarkSeen = vi.mocked(markSeen);
const mockMarkReviewInlineThreads = vi.mocked(markReviewInlineThreads);
const mockAutoResolveOutdated = vi.mocked(autoResolveOutdated);

const BASE_OPTS = { format: "text" as const };

function defaultConfig() {
  return {
    botUsernames: ["coderabbitai"],
    ignoreChecks: [],
    iterate: {
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 60,
      minimizeApprovals: false,
      minimizeComments: "all" as "all" | "bots" | "users" | "none",
    },
    watch: { readyDelayMinutes: 10 },
    resolve: {
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
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
    mockLoadSeenMap.mockResolvedValue(new Map());
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
  markReviewInlineThreads,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockFetchStartupFailureChecks,
  mockFetchCheckRunAnnotations,
  mockGetCurrentPrNumber,
  mockGetMergeableState,
  mockLoadConfig,
  mockLoadSeenMap,
  mockMarkSeen,
  mockMarkReviewInlineThreads,
  mockTriageFailingChecks,
  runCheck,
  triageFailingChecks,
};
export type { BatchPrData, ClassifiedCheck, PrComment, ReviewThread };
