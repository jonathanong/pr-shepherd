import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../github/batch.mts", () => ({ fetchPrBatch: vi.fn() }));
vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getMergeableState: vi.fn(),
}));
vi.mock("../cache/file-cache.mts", () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
vi.mock("../checks/triage.mts", () => ({
  triageFailingChecks: vi.fn((checks: unknown[]) => Promise.resolve(checks)),
}));
vi.mock("../comments/resolve.mts", () => ({
  autoResolveOutdated: vi.fn().mockResolvedValue({ resolved: [], errors: [] }),
}));

import { runCheck } from "./check.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { getCurrentPrNumber, getMergeableState } from "../github/client.mts";
import { cacheGet, cacheSet } from "../cache/file-cache.mts";
import { triageFailingChecks } from "../checks/triage.mts";
import type { BatchPrData, ClassifiedCheck } from "../types.mts";

const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockGetMergeableState = vi.mocked(getMergeableState);
const mockCacheGet = vi.mocked(cacheGet);
const mockCacheSet = vi.mocked(cacheSet);
const mockTriageFailingChecks = vi.mocked(triageFailingChecks);

const BASE_OPTS = { format: "text" as const, noCache: false, cacheTtlSeconds: 300 };

function makeCheck(overrides: Partial<ClassifiedCheck> = {}): ClassifiedCheck {
  return {
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
    checks: [makeCheck()],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
  mockCacheSet.mockResolvedValue(undefined);
  mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
  mockGetMergeableState.mockResolvedValue({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" });
});

// ---------------------------------------------------------------------------
// No PR found
// ---------------------------------------------------------------------------

describe("runCheck — no PR", () => {
  it("throws when no PR number is found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runCheck(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

describe("runCheck — caching", () => {
  it("uses cached data and skips fetchPrBatch on cache hit", async () => {
    mockCacheGet.mockResolvedValue(makeBatchData());
    await runCheck(BASE_OPTS);
    expect(mockFetchPrBatch).not.toHaveBeenCalled();
  });

  it("calls fetchPrBatch and caches result on miss", async () => {
    await runCheck(BASE_OPTS);
    expect(mockFetchPrBatch).toHaveBeenCalledTimes(1);
    expect(mockCacheSet).toHaveBeenCalledTimes(1);
  });

  it("bypasses cache when autoResolve=true (cacheGet called with disabled=true)", async () => {
    await runCheck({ ...BASE_OPTS, autoResolve: true });
    expect(mockCacheGet).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ disabled: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// UNKNOWN merge state fallback
// ---------------------------------------------------------------------------

describe("runCheck — UNKNOWN merge state", () => {
  it("calls getMergeableState REST fallback when mergeStateStatus=UNKNOWN + state=OPEN", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }),
    });
    await runCheck(BASE_OPTS);
    expect(mockGetMergeableState).toHaveBeenCalledTimes(1);
  });

  it("does NOT call getMergeableState when state=MERGED", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ state: "MERGED", mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }),
    });
    await runCheck(BASE_OPTS);
    expect(mockGetMergeableState).not.toHaveBeenCalled();
  });

  it("does NOT cache UNKNOWN merge result", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "UNKNOWN" }),
    });
    await runCheck(BASE_OPTS);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skipTriage
// ---------------------------------------------------------------------------

describe("runCheck — skipTriage", () => {
  it("skips triageFailingChecks when skipTriage=true", async () => {
    const failingCheck = makeCheck({ category: "failing", conclusion: "FAILURE" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ checks: [failingCheck] }),
    });
    await runCheck({ ...BASE_OPTS, skipTriage: true });
    expect(mockTriageFailingChecks).not.toHaveBeenCalled();
  });

  it("calls triageFailingChecks when failing checks exist and skipTriage is absent", async () => {
    const failingCheck = makeCheck({ category: "failing", conclusion: "FAILURE" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ checks: [failingCheck] }),
    });
    await runCheck(BASE_OPTS);
    expect(mockTriageFailingChecks).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// blockedByFilteredCheck ghost flag
// ---------------------------------------------------------------------------

describe("runCheck — blockedByFilteredCheck", () => {
  it("sets blockedByFilteredCheck=true when BLOCKED + no failing/in-progress + filtered checks exist", async () => {
    const filteredCheck = makeCheck({ category: "filtered", event: "push" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        checks: [filteredCheck],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.checks.blockedByFilteredCheck).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeStatus precedence
// ---------------------------------------------------------------------------

describe("runCheck — computeStatus precedence", () => {
  it("returns FAILING when mergeStateStatus=DIRTY (CONFLICTS)", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "DIRTY" }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("FAILING");
  });

  it("returns FAILING when anyFailing", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ checks: [makeCheck({ category: "failing", conclusion: "FAILURE" })] }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("FAILING");
  });

  it("returns IN_PROGRESS before BLOCKED", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        checks: [makeCheck({ category: "in_progress", status: "IN_PROGRESS", conclusion: null })],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("IN_PROGRESS");
  });

  it("returns READY when CI passed and merge is clean", async () => {
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("READY");
  });
});

// ---------------------------------------------------------------------------
// Human approval pending — BLOCKED + REVIEW_REQUIRED
// ---------------------------------------------------------------------------

describe("runCheck — BLOCKED + REVIEW_REQUIRED (human approval pending)", () => {
  it("returns READY when CI passed and only human approval is missing", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED" }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("READY");
    expect(report.mergeStatus.status).toBe("BLOCKED");
    expect(report.mergeStatus.reviewDecision).toBe("REVIEW_REQUIRED");
  });

  it("returns FAILING when a CI check is also failing", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        reviewDecision: "REVIEW_REQUIRED",
        checks: [makeCheck({ category: "failing", conclusion: "FAILURE" })],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("FAILING");
  });

  it("returns FAILING when an unresolved thread also exists (iterate handles it via actionable check)", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        reviewDecision: "REVIEW_REQUIRED",
        reviewThreads: [
          {
            id: "t1",
            isResolved: false,
            isOutdated: false,
            isMinimized: false,
            path: "src/foo.ts",
            line: 1,
            author: "alice",
            body: "fix this",
            createdAtUnix: 0,
          },
        ],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("FAILING");
  });

  it("returns FAILING when copilot review is also in progress", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        reviewDecision: "REVIEW_REQUIRED",
        reviewRequests: [{ login: "copilot-pull-request-reviewer[bot]" }],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("FAILING");
  });

  it("returns FAILING when BLOCKED but reviewDecision is null (other branch protection)", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "BLOCKED", reviewDecision: null }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("FAILING");
  });
});

// ---------------------------------------------------------------------------
// Thread minimization filtering
// ---------------------------------------------------------------------------

describe("runCheck — minimized thread filtering", () => {
  it("excludes threads whose top comment is minimized from actionable threads", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          {
            id: "t-visible",
            isResolved: false,
            isOutdated: false,
            isMinimized: false,
            path: "src/foo.ts",
            line: 1,
            author: "alice",
            body: "fix this",
            createdAtUnix: 0,
          },
          {
            id: "t-minimized",
            isResolved: false,
            isOutdated: false,
            isMinimized: true,
            path: "src/bar.ts",
            line: 2,
            author: "gemini-code-assist",
            body: "You have reached your daily quota limit.",
            createdAtUnix: 0,
          },
        ],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.actionable).toHaveLength(1);
    expect(report.threads.actionable[0]?.id).toBe("t-visible");
  });
});
