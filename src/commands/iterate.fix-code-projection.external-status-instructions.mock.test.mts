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

describe("runIterate — external check follow-up", () => {
  it("keeps an external check with a details URL in FIX_CODE", async () => {
    const externalCheck = {
      name: "codecov/patch",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://app.codecov.io/...",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
      summary: "98.70% of diff hit (target 100.00%)",
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [externalCheck],
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

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.checks).toHaveLength(1);
    expect(result.fix.checks.map((check) => check.name)).toEqual(["codecov/patch"]);
    expect(result.fix.checks[0]).toMatchObject({
      detailsUrl: "https://app.codecov.io/...",
      summary: "98.70% of diff hit (target 100.00%)",
    });
    expect(result.fix.instructions.join("\n")).toContain("CI failure triage");
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
