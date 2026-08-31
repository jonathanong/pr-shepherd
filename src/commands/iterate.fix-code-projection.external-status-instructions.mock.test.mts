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

describe("runIterate — check follow-up escalation", () => {
  it("escalates when every failing check lacks autonomous follow-up", async () => {
    const externalCheck = {
      name: "codecov/patch",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://app.codecov.io/...",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    const ghActionsCheck = makeActionableCheck("run-77", "lint");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [externalCheck, ghActionsCheck],
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

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toEqual(["check-follow-up-unavailable"]);
      expect(result.escalate.checks).toHaveLength(2);
      expect(result.escalate.checks?.map((check) => check.name)).toEqual(["codecov/patch", "lint"]);
      expect(result.escalate.humanMessage).toContain("https://app.codecov.io/...");
      expect(result.escalate.humanMessage).toContain("run-77");
    }
  });
  it("escalates a bare check and preserves its raw metadata", async () => {
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
          failing: [bareCheck],
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

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toEqual(["check-follow-up-unavailable"]);
      expect(result.escalate.checks).toEqual([
        expect.objectContaining({
          name: "mystery",
          runId: null,
          detailsUrl: "",
          conclusion: "FAILURE",
        }),
      ]);
      expect(result.escalate.humanMessage).toContain("no run ID or URL");
    }
  });
});
