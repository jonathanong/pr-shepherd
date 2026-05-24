import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockGetMergeableState,
  makeThread,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — BLOCKED + clean (hand off to humans)", () => {
  it("returns READY when CI passed and only human approval is missing", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED" }),
    });
    mockGetMergeableState.mockResolvedValue({
      mergeable: "MERGEABLE",
      mergeStateStatus: "BLOCKED",
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
            authorType: "Unknown" as const,
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

  it("keeps outdated threads in resolutionOnly even when autoResolve is requested", async () => {
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

    expect(report.status).toBe("PENDING");
    expect(mockAutoResolveOutdated).not.toHaveBeenCalled();
    expect(report.threads.resolutionOnly.map((t) => t.id)).toEqual(["t-auto"]);
    expect(report.threads.firstLook[0]?.autoResolved).toBeUndefined();
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
    mockGetMergeableState.mockResolvedValue({
      mergeable: "MERGEABLE",
      mergeStateStatus: "HAS_HOOKS",
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("READY");
    expect(report.mergeStatus.status).toBe("BLOCKED");
    expect(report.mergeStatus.mergeStateStatus).toBe("HAS_HOOKS");
  });
});
