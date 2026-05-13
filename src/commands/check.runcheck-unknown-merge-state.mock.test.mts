// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  getMergeableState,
  makeBatchData,
  mockFetchPrBatch,
  mockGetMergeableState,
} from "./check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

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
