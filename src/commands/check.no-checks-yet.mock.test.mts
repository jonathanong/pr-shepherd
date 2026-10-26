import { describe, expect, it } from "vitest";
import {
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  registerHooks,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

const clean = { checks: [], mergeStateStatus: "CLEAN" as const };

describe("runCheck CLEAN with no checks yet", () => {
  it("is PENDING while a relevant Actions suite is still running", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData(clean),
      headWorkflowSuites: [
        { status: "QUEUED", conclusion: null, workflowRun: { event: "pull_request" } },
      ],
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("PENDING");
    expect(report.actionsWorkflowInProgress).toBe(true);
  });

  it("is PENDING for a draft while a relevant Actions suite is still running", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ ...clean, isDraft: true }),
      headWorkflowSuites: [
        { status: "IN_PROGRESS", conclusion: null, workflowRun: { event: "pull_request" } },
      ],
    });
    expect((await runCheck(BASE_OPTS)).status).toBe("PENDING");
  });

  it("stays READY for a repository with no suites or only completed ones", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData(clean) });
    expect((await runCheck(BASE_OPTS)).status).toBe("READY");
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData(clean),
      headWorkflowSuites: [
        { status: "COMPLETED", conclusion: "SUCCESS", workflowRun: { event: "pull_request" } },
      ],
    });
    expect((await runCheck(BASE_OPTS)).status).toBe("READY");
  });
});
