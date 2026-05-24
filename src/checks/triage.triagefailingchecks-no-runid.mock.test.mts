import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  mockFetch,
  triageFailingChecks,
} from "../../test-helpers/checks/triage.test-support.mts";

registerHooks();

describe("triageFailingChecks — no runId", () => {
  it("skips fetch and returns no job info when runId is null", async () => {
    const check = makeCheck({ runId: null });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.workflowName).toBeUndefined();
    expect(result!.jobName).toBeUndefined();
    expect(result!.failedStep).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("TIMED_OUT with runId=null — no fetch, no job info", async () => {
    const check = makeCheck({ runId: null, conclusion: "TIMED_OUT" });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.workflowName).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
