// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockFetchPrBatch,
  mockTriageFailingChecks,
  runCheck,
  triageFailingChecks,
} from "./check.test-support.mts";

registerHooks();

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
