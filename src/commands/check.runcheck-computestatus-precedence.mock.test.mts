// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockFetchPrBatch,
} from "./check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

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
