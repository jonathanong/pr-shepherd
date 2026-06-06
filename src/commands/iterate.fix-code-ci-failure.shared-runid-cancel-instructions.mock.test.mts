import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockFetch,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

function makeActionableCheck(runId: string, name = "typecheck") {
  return {
    name,
    status: "COMPLETED" as const,
    conclusion: "FAILURE" as const,
    detailsUrl: `https://github.com/owner/repo/actions/runs/${runId}`,
    event: "pull_request",
    runId,
    category: "failing" as const,
  };
}

describe("runIterate — fix_code (actionable CI failure)", () => {
  it("two checks sharing a runId emit two AgentChecks but only call gh run cancel once", async () => {
    const check1 = makeActionableCheck("run-300", "typecheck");
    const check2 = makeActionableCheck("run-300", "lint");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [check1, check2],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
          ignoredNames: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      // Both AgentChecks are present — each may carry distinct workflowName/jobName.
      expect(result.fix.checks).toHaveLength(2);
      expect(result.fix.checks.map((c) => c.runId)).toEqual(["run-300", "run-300"]);
      expect(result.cancelled).toEqual(["run-300"]);
    }
    const cancelCalls = (mockFetch.mock.calls as Array<[string, RequestInit]>).filter(([url]) =>
      url.includes("/cancel"),
    );
    expect(cancelCalls).toHaveLength(1);
  });
});
