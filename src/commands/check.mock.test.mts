/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { runCheck } from "./check.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { getCurrentPrNumber, getMergeableState } from "../github/client.mts";
import { fetchStartupFailureChecks, triageFailingChecks } from "../checks/triage.mts";
import { loadSeenMap, markSeen, hashBody } from "../state/seen-comments.mts";
import { autoResolveOutdated } from "../comments/resolve.mts";
import type { BatchPrData, ClassifiedCheck, ReviewThread, PrComment } from "../types.mts";

const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockGetMergeableState = vi.mocked(getMergeableState);
const mockTriageFailingChecks = vi.mocked(triageFailingChecks);
const mockFetchStartupFailureChecks = vi.mocked(fetchStartupFailureChecks);
const mockLoadSeenMap = vi.mocked(loadSeenMap);
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
    checks: [makeCheck()],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
  mockGetMergeableState.mockResolvedValue({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" });
  mockFetchStartupFailureChecks.mockResolvedValue([]);
});

// No PR found

describe("runCheck — no PR", () => {
  it("throws when no PR number is found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runCheck(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});

// UNKNOWN merge state fallback

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

// skipTriage

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

describe("runCheck — startup failure workflow runs", () => {
  it("adds REST startup failures before classification so they block readiness", async () => {
    mockFetchStartupFailureChecks.mockResolvedValue([
      {
        name: "CI",
        status: "COMPLETED",
        conclusion: "STARTUP_FAILURE",
        detailsUrl: "https://github.com/owner/repo/actions/runs/25406234225",
        event: "pull_request",
        runId: "25406234225",
        summary: "ci: skip secret-backed jobs for dependency bots",
      },
    ]);

    const report = await runCheck(BASE_OPTS);

    expect(mockFetchStartupFailureChecks).toHaveBeenCalledWith(
      { owner: "owner", name: "repo" },
      "abc123",
    );
    expect(report.status).toBe("FAILING");
    expect(report.checks.failing).toEqual([
      expect.objectContaining({
        name: "CI",
        conclusion: "STARTUP_FAILURE",
        runId: "25406234225",
        summary: "ci: skip secret-backed jobs for dependency bots",
      }),
    ]);
    expect(mockTriageFailingChecks).toHaveBeenCalledWith(
      [expect.objectContaining({ conclusion: "STARTUP_FAILURE" })],
      { owner: "owner", name: "repo" },
    );
  });

  it("overwrites an existing check from the same run instead of duplicating it", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        checks: [
          makeCheck({
            name: "CI",
            conclusion: "SUCCESS",
            runId: "25406234225",
            detailsUrl: "https://github.com/owner/repo/actions/runs/25406234225/job/1",
          }),
        ],
      }),
    });
    mockFetchStartupFailureChecks.mockResolvedValue([
      {
        name: "CI",
        status: "COMPLETED",
        conclusion: "STARTUP_FAILURE",
        detailsUrl: "https://github.com/owner/repo/actions/runs/25406234225",
        event: "pull_request",
        runId: "25406234225",
      },
    ]);

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.passing).toHaveLength(0);
    expect(report.checks.failing).toHaveLength(1);
    expect(report.checks.failing[0]).toEqual(
      expect.objectContaining({
        name: "CI",
        conclusion: "STARTUP_FAILURE",
        detailsUrl: "https://github.com/owner/repo/actions/runs/25406234225",
      }),
    );
  });

  it("keeps non-PR startup failures filtered out of the readiness verdict", async () => {
    mockFetchStartupFailureChecks.mockResolvedValue([
      {
        name: "nightly",
        status: "COMPLETED",
        conclusion: "STARTUP_FAILURE",
        detailsUrl: "https://github.com/owner/repo/actions/runs/123",
        event: "workflow_dispatch",
        runId: "123",
      },
    ]);

    const report = await runCheck(BASE_OPTS);

    expect(report.status).toBe("READY");
    expect(report.checks.failing).toHaveLength(0);
    expect(report.checks.filtered).toEqual([
      expect.objectContaining({ name: "nightly", conclusion: "STARTUP_FAILURE" }),
    ]);
  });
});

// blockedByFilteredCheck ghost flag

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

// computeStatus precedence

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

// BLOCKED + clean — hand off to humans via ready-delay

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

  it("returns PENDING when an unresolved outdated thread still needs resolution", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        reviewDecision: "REVIEW_REQUIRED",
        reviewThreads: [outdated],
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.status).toBe("PENDING");
    expect(report.threads.actionable).toHaveLength(0);
    expect(report.threads.resolutionOnly.map((t) => t.id)).toEqual(["t-outdated"]);
  });

  it("does not keep auto-resolved outdated threads in resolutionOnly", async () => {
    const outdated = makeThread({ id: "t-auto", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        reviewDecision: "REVIEW_REQUIRED",
        reviewThreads: [outdated],
      }),
    });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["t-auto"], errors: [] });

    const report = await runCheck({ ...BASE_OPTS, autoResolve: true });

    expect(report.status).toBe("READY");
    expect(report.threads.resolutionOnly).toHaveLength(0);
    expect(report.threads.firstLook[0]?.autoResolved).toBe(true);
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

// Thread minimization filtering

describe("runCheck — reviewSummaries + approvedReviews pass-through", () => {
  it("surfaces an unseen summary in firstLookSummaries (not reviewSummaries) and marks it seen", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [{ id: "PRR_SUM", author: "copilot", body: "overview" }],
        approvedReviews: [{ id: "PRR_AP", author: "alice", body: "" }],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.firstLookSummaries).toEqual([
      { id: "PRR_SUM", author: "copilot", body: "overview" },
    ]);
    expect(report.reviewSummaries).toEqual([]);
    expect(report.approvedReviews).toEqual([{ id: "PRR_AP", author: "alice", body: "" }]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.anything(), "PRR_SUM", "overview");
  });

  it("surfaces an already-seen summary in reviewSummaries (not firstLookSummaries)", async () => {
    mockLoadSeenMap.mockResolvedValue(
      new Map([["PRR_SUM", { seenAt: 1000, bodyHash: hashBody("overview") }]]),
    );
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [{ id: "PRR_SUM", author: "copilot", body: "overview" }],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.reviewSummaries).toEqual([
      { id: "PRR_SUM", author: "copilot", body: "overview" },
    ]);
    expect(report.firstLookSummaries).toEqual([]);
    expect(mockMarkSeen).not.toHaveBeenCalledWith(expect.anything(), "PRR_SUM", expect.anything());
  });

  it("defaults to empty arrays when batch has none", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    const report = await runCheck(BASE_OPTS);
    expect(report.reviewSummaries).toEqual([]);
    expect(report.firstLookSummaries).toEqual([]);
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
    mockLoadSeenMap.mockResolvedValue(new Map());
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.id).toBe("t-outdated");
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("outdated");
    expect(report.threads.firstLook[0]?.autoResolved).toBe(false);
  });

  it("marks auto-resolved outdated thread with autoResolved: true", async () => {
    const outdated = makeThread({ id: "t-auto", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["t-auto"], errors: [] });
    const report = await runCheck({ ...BASE_OPTS, autoResolve: true });
    expect(report.threads.firstLook[0]?.autoResolved).toBe(true);
  });

  it("surfaces unseen resolved thread in threads.firstLook", async () => {
    const resolved = makeThread({ id: "t-resolved", isResolved: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [resolved] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("resolved");
  });

  it("surfaces unseen minimized thread in threads.firstLook", async () => {
    const minimized = makeThread({ id: "t-minimized", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [minimized] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("minimized");
  });

  it("surfaces unseen minimized comment in comments.firstLook", async () => {
    const minimized = makeComment({ id: "c-min", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [minimized] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());

    const report = await runCheck(BASE_OPTS);
    expect(report.comments.firstLook).toHaveLength(1);
    expect(report.comments.firstLook[0]?.firstLookStatus).toBe("minimized");
  });

  it("suppresses already-seen items (unchanged hash)", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true, body: "fix this" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated", { seenAt: 1000, bodyHash: hashBody("fix this") }]]),
    );

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(0);
  });

  it("suppresses already-seen items (legacy marker without hash)", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockLoadSeenMap.mockResolvedValue(new Map([["t-outdated", { seenAt: 1000 }]]));

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(0);
  });

  it("re-surfaces edited item with edited: true", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true, body: "new body" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    // Stored hash does NOT match current body → classified as "edited"
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated", { seenAt: 1000, bodyHash: hashBody("old body") }]]),
    );

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.edited).toBe(true);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("outdated");
  });

  it("calls markSeen for each first-look item with the item body", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true, body: "fix this" });
    const minimized = makeComment({ id: "c-min", isMinimized: true, body: "nit" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated], comments: [minimized] }),
    });
    mockLoadSeenMap.mockResolvedValue(new Map());

    await runCheck(BASE_OPTS);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "t-outdated", "fix this");
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "c-min", "nit");
  });
});
