import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  mockGetMergeableState,
} from "./check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — READY mergeability recheck", () => {
  it("refreshes mergeability before returning READY and returns FAILING when REST reports conflicts", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" }),
    });
    mockGetMergeableState.mockResolvedValue({
      mergeable: "CONFLICTING",
      mergeStateStatus: "DIRTY",
    });

    const report = await runCheck(BASE_OPTS);

    expect(mockGetMergeableState).toHaveBeenCalledTimes(1);
    expect(report.status).toBe("FAILING");
    expect(report.mergeStatus.status).toBe("CONFLICTS");
    expect(report.mergeStatus.mergeable).toBe("CONFLICTING");
    expect(report.mergeStatus.mergeStateStatus).toBe("DIRTY");
  });

  it("keeps READY when the refresh reports a human handoff state", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" }),
    });
    mockGetMergeableState.mockResolvedValue({
      mergeable: "MERGEABLE",
      mergeStateStatus: "BLOCKED",
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.status).toBe("READY");
    expect(report.mergeStatus.status).toBe("BLOCKED");
    expect(report.mergeStatus.mergeStateStatus).toBe("BLOCKED");
  });

  it("does not recheck twice when UNKNOWN fallback already refreshed mergeability", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }),
    });
    mockGetMergeableState.mockResolvedValue({
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.status).toBe("READY");
    expect(mockGetMergeableState).toHaveBeenCalledTimes(1);
  });
});
