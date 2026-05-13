// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  mockFetch,
  triageFailingChecks,
} from "./triage.test-support.mts";

registerHooks();

describe("triageFailingChecks — CANCELLED short-circuits", () => {
  it("CANCELLED with runId: skips jobs fetch, returns only base check fields", async () => {
    const check = makeCheck({ conclusion: "CANCELLED" });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.conclusion).toBe("CANCELLED");
    expect(result!.workflowName).toBeUndefined();
    expect(result!.jobName).toBeUndefined();
    expect(result!.failedStep).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
