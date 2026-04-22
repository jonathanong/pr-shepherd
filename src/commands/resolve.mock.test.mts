import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));

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
      concurrency: 4,
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
      fetchReviewSummaries: true,
    },
    actions: {
      autoResolveOutdated: true,
      autoRebase: true,
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
import type { BatchPrData, ReviewThread, PrComment } from "../types.mts";

const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockAutoResolveOutdated = vi.mocked(autoResolveOutdated);
const mockApplyResolveOptions = vi.mocked(applyResolveOptions);
const mockLoadConfig = vi.mocked(loadConfig);

const BASE_OPTS = { format: "text" as const, noCache: false, cacheTtlSeconds: 300 };

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
    baseRefName: "main",
    reviewRequests: [],
    latestReviews: [],
    reviewThreads: [],
    comments: [],
    changesRequestedReviews: [],
    reviewSummaries: [],
    checks: [],
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
    body: "fix this",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: "c-1",
    isMinimized: false,
    author: "bob",
    body: "nit",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAutoResolveOutdated.mockResolvedValue({ resolved: [], errors: [] });
  mockApplyResolveOptions.mockResolvedValue({
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  });
});

// ---------------------------------------------------------------------------
// runResolveFetch
// ---------------------------------------------------------------------------

describe("runResolveFetch — no PR", () => {
  it("throws when no open PR found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runResolveFetch(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});

describe("runResolveFetch — auto-resolves outdated threads", () => {
  it("calls autoResolveOutdated with outdated+unresolved thread IDs", async () => {
    const outdated = makeThread({ id: "outdated-1", isOutdated: true, isResolved: false });
    const resolved = makeThread({ id: "resolved-1", isOutdated: true, isResolved: true });
    const active = makeThread({ id: "active-1", isOutdated: false });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated, resolved, active] }),
    });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["outdated-1"], errors: [] });

    await runResolveFetch(BASE_OPTS);
    expect(mockAutoResolveOutdated).toHaveBeenCalledWith(["outdated-1"]);
  });

  it("activeThreads excludes outdated threads", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    const active = makeThread({ id: "t-active", isOutdated: false });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated, active] }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads.map((t) => t.id)).toEqual(["t-active"]);
  });

  it("actionableComments excludes minimized comments", async () => {
    const visible = makeComment({ id: "c-visible", isMinimized: false });
    const minimized = makeComment({ id: "c-min", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [visible, minimized] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableComments.map((c) => c.id)).toEqual(["c-visible"]);
  });

  it("actionableThreads excludes threads whose top comment is minimized", async () => {
    const visible = makeThread({ id: "t-visible", isMinimized: false });
    const minimized = makeThread({ id: "t-minimized", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [visible, minimized] }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads.map((t) => t.id)).toEqual(["t-visible"]);
  });

  it("surfaces reviewSummaries when fetchReviewSummaries is true", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [{ id: "PRR_1", author: "copilot", body: "overview" }],
      }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.reviewSummaries).toEqual([{ id: "PRR_1", author: "copilot", body: "overview" }]);
  });

  it("returns empty reviewSummaries when fetchReviewSummaries is false", async () => {
    mockLoadConfig.mockReturnValueOnce({
      resolve: {
        concurrency: 4,
        shaPoll: { intervalMs: 2000, maxAttempts: 10 },
        fetchReviewSummaries: false,
      },
      actions: {
        autoResolveOutdated: true,
        autoRebase: true,
        autoMarkReady: true,
        commitSuggestions: true,
      },
    } as ReturnType<typeof loadConfig>);
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [{ id: "PRR_1", author: "copilot", body: "overview" }],
      }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.reviewSummaries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runResolveMutate
// ---------------------------------------------------------------------------

describe("runResolveMutate — no PR", () => {
  it("throws when no open PR found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runResolveMutate(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});

describe("runResolveMutate — forwards options", () => {
  it("forwards all IDs and requireSha to applyResolveOptions", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-1"],
      minimizeCommentIds: ["c-1"],
      dismissReviewIds: ["r-1"],
      dismissMessage: "done",
      requireSha: "sha-abc",
    });
    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        resolveThreadIds: ["t-1"],
        minimizeCommentIds: ["c-1"],
        dismissReviewIds: ["r-1"],
        dismissMessage: "done",
        requireSha: "sha-abc",
      }),
    );
  });
});
