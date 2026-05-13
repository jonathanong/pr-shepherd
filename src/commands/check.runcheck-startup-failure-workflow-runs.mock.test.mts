// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockFetchPrBatch,
  mockFetchStartupFailureChecks,
  mockTriageFailingChecks,
} from "./check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

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
      42,
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

  it("replaces an existing check from the same run instead of preserving stale metadata", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        checks: [
          makeCheck({
            name: "CI",
            conclusion: "SUCCESS",
            runId: "25406234225",
            detailsUrl: "https://github.com/owner/repo/actions/runs/25406234225/job/1",
            summary: "stale job summary",
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
        summary: "startup failure title",
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
        summary: "startup failure title",
      }),
    );
    expect(report.checks.failing[0]!.summary).not.toBe("stale job summary");
  });

  it("replaces all existing checks from the same startup-failure run with one run entry", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        checks: [
          makeCheck({ name: "build", conclusion: "SUCCESS", runId: "25406234225" }),
          makeCheck({ name: "test", conclusion: "SUCCESS", runId: "25406234225" }),
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
      expect.objectContaining({ name: "CI", conclusion: "STARTUP_FAILURE" }),
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
