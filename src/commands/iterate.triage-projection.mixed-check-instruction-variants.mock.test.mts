import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
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

describe("runIterate — mixed check follow-up", () => {
  it("keeps all checks in TRIAGE when an external URL is actionable", async () => {
    const ghActionsCheck = makeActionableCheck("run-77", "lint");
    const externalCheck = {
      name: "codecov/patch",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://app.codecov.io/...",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    const bareCheck = {
      name: "mystery",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [ghActionsCheck, externalCheck, bareCheck],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;
    expect(result.triage.checks).toHaveLength(3);
    expect(result.triage.checks.map((check) => check.name)).toEqual([
      "lint",
      "codecov/patch",
      "mystery",
    ]);
    expect(result.triage.checks[1]?.detailsUrl).toBe("https://app.codecov.io/...");
    expect(result.triage.checks[2]).toMatchObject({ runId: null, detailsUrl: "" });
  });
});
