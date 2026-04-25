import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../github/batch.mts", () => ({ fetchPrBatch: vi.fn() }));
vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getMergeableState: vi.fn(),
}));
vi.mock("../checks/triage.mts", () => ({
  triageFailingChecks: vi.fn((checks: unknown[]) => Promise.resolve(checks)),
}));
vi.mock("../comments/resolve.mts", () => ({
  autoResolveOutdated: vi.fn().mockResolvedValue({ resolved: [], errors: [] }),
}));
vi.mock("../state/seen-comments.mts", () => ({
  hasSeen: vi.fn().mockResolvedValue(false),
  markSeen: vi.fn().mockResolvedValue(undefined),
}));

import { runCheck } from "./check.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { getCurrentPrNumber, getMergeableState } from "../github/client.mts";
import { triageFailingChecks } from "../checks/triage.mts";
import { hasSeen, markSeen } from "../state/seen-comments.mts";
import { autoResolveOutdated } from "../comments/resolve.mts";
import type { BatchPrData, ClassifiedCheck, ReviewThread, PrComment } from "../types.mts";

const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockGetMergeableState = vi.mocked(getMergeableState);
const mockTriageFailingChecks = vi.mocked(triageFailingChecks);
const mockHasSeen = vi.mocked(hasSeen);
const mockMarkSeen = vi.mocked(markSeen);
const mockAutoResolveOutdated = vi.mocked(autoResolveOutdated);

const BASE_OPTS = { format: "text" as const };

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
    approvedReviews: [],
    checks: [makeCheck()],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
// BLOCKED + clean — hand off to humans via ready-delay
// ---------------------------------------------------------------------------

describe("runCheck — BLOCKED + clean (hand off to humans)", () => {
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

  it("returns PENDING when an unresolved thread also exists (iterate handles it via actionable check)", async () => {
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
            startLine: null,
            author: "alice",
            body: "fix this",
            url: "",
            createdAtUnix: 0,
          },
        ],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("PENDING");
  });

  it("returns PENDING when copilot review is also in progress", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        reviewDecision: "REVIEW_REQUIRED",
        reviewRequests: [{ login: "copilot-pull-request-reviewer[bot]" }],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("PENDING");
  });

  it("returns READY when BLOCKED with reviewDecision null (other branch protection — still hand off)", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "BLOCKED", reviewDecision: null }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("READY");
  });

  it("returns READY when BLOCKED with reviewDecision APPROVED (insufficient approvals)", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "BLOCKED", reviewDecision: "APPROVED" }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("READY");
  });

  it("returns PENDING when BLOCKED with zero relevant checks (CI never started)", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        reviewDecision: "REVIEW_REQUIRED",
        checks: [],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("PENDING");
  });

  it("returns READY when HAS_HOOKS (derived BLOCKED) and CI passed", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "HAS_HOOKS", reviewDecision: "REVIEW_REQUIRED" }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("READY");
    expect(report.mergeStatus.status).toBe("BLOCKED");
    expect(report.mergeStatus.mergeStateStatus).toBe("HAS_HOOKS");
  });
});

// ---------------------------------------------------------------------------
// Thread minimization filtering
// ---------------------------------------------------------------------------

describe("runCheck — reviewSummaries + approvedReviews pass-through", () => {
  it("surfaces reviewSummaries and approvedReviews on the report", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [{ id: "PRR_SUM", author: "copilot", body: "overview" }],
        approvedReviews: [{ id: "PRR_AP", author: "alice", body: "" }],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.reviewSummaries).toEqual([
      { id: "PRR_SUM", author: "copilot", body: "overview" },
    ]);
    expect(report.approvedReviews).toEqual([{ id: "PRR_AP", author: "alice", body: "" }]);
  });

  it("defaults to empty arrays when batch has none", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    const report = await runCheck(BASE_OPTS);
    expect(report.reviewSummaries).toEqual([]);
    expect(report.approvedReviews).toEqual([]);
  });
});

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
            startLine: null,
            author: "alice",
            body: "fix this",
            url: "",
            createdAtUnix: 0,
          },
          {
            id: "t-minimized",
            isResolved: false,
            isOutdated: false,
            isMinimized: true,
            path: "src/bar.ts",
            line: 2,
            startLine: null,
            author: "gemini-code-assist",
            body: "You have reached your daily quota limit.",
            url: "",
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
    body: "nit",
    url: "",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

describe("runCheck — first-look items", () => {
  it("surfaces unseen outdated thread in threads.firstLook", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockHasSeen.mockResolvedValue(false);

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.id).toBe("t-outdated");
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("outdated");
    expect(report.threads.firstLook[0]?.autoResolved).toBe(false);
  });

  it("marks auto-resolved outdated thread with autoResolved: true", async () => {
    const outdated = makeThread({ id: "t-auto", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockHasSeen.mockResolvedValue(false);
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["t-auto"], errors: [] });

    const report = await runCheck({ ...BASE_OPTS, autoResolve: true });
    expect(report.threads.firstLook[0]?.autoResolved).toBe(true);
  });

  it("surfaces unseen resolved thread in threads.firstLook", async () => {
    const resolved = makeThread({ id: "t-resolved", isResolved: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [resolved] }) });
    mockHasSeen.mockResolvedValue(false);

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("resolved");
  });

  it("surfaces unseen minimized thread in threads.firstLook", async () => {
    const minimized = makeThread({ id: "t-minimized", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [minimized] }) });
    mockHasSeen.mockResolvedValue(false);

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("minimized");
  });

  it("surfaces unseen minimized comment in comments.firstLook", async () => {
    const minimized = makeComment({ id: "c-min", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [minimized] }) });
    mockHasSeen.mockResolvedValue(false);

    const report = await runCheck(BASE_OPTS);
    expect(report.comments.firstLook).toHaveLength(1);
    expect(report.comments.firstLook[0]?.firstLookStatus).toBe("minimized");
  });

  it("suppresses already-seen items", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockHasSeen.mockResolvedValue(true);

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(0);
  });

  it("calls markSeen for each first-look item", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    const minimized = makeComment({ id: "c-min", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated], comments: [minimized] }),
    });
    mockHasSeen.mockResolvedValue(false);

    await runCheck(BASE_OPTS);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "t-outdated");
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "c-min");
  });
});
