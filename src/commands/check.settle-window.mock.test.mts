import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockFetchPrBatch,
  registerHooks,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

const NOW = Date.parse("2026-11-22T05:09:10Z") / 1000;
// Issue #815, PR 53: seven third-party suites queued with no workflow run (so none reach
// `headWorkflowSuites`), no rollup, and a merge state of CLEAN a few seconds after the push.
const zeroCheckClean = (ageSeconds: number | undefined, extra = {}) =>
  makeBatchData({
    checks: [],
    mergeStateStatus: "CLEAN",
    ...(ageSeconds !== undefined && { headFreshAtUnix: NOW - ageSeconds }),
    ...extra,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
});
afterEach(() => vi.useRealTimers());

describe("runCheck settle window for a head with no relevant check", () => {
  it("is PENDING for a CLEAN head that reached GitHub seconds ago", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: zeroCheckClean(6) });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("PENDING");
    expect(report.awaitingCheckRegistration).toBe(true);
  });

  it("is PENDING for a draft head inside the window", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: zeroCheckClean(6, { isDraft: true }) });
    expect((await runCheck(BASE_OPTS)).status).toBe("PENDING");
  });

  it("reaches READY once the window has passed, so a repository with no CI finishes", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: zeroCheckClean(61) });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("READY");
    expect(report.awaitingCheckRegistration).toBeUndefined();
  });

  it("is READY when no signal says how old the head is", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: zeroCheckClean(undefined) });
    expect((await runCheck(BASE_OPTS)).status).toBe("READY");
  });

  it("does not hold a fresh head that already has a relevant check", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: zeroCheckClean(6, { checks: [makeCheck()] }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("READY");
    expect(report.awaitingCheckRegistration).toBeUndefined();
  });

  it("reports the Actions suite, not the settle flag, once the suite exists", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: zeroCheckClean(2),
      headWorkflowSuites: [
        { status: "QUEUED", conclusion: null, workflowRun: { event: "pull_request" } },
      ],
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("PENDING");
    expect(report.actionsWorkflowInProgress).toBe(true);
    expect(report.awaitingCheckRegistration).toBeUndefined();
  });
});
