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

// ---------------------------------------------------------------------------
// base.checks — always carries all relevant checks regardless of action
// ---------------------------------------------------------------------------

describe("runIterate — base.checks carries passing + failing (regression: missing CI bug)", () => {
  it("regression: 5 passing + 1 infra failure → fix_code with failing check in base.checks", async () => {
    const infraCheck = {
      name: "build",
      status: "COMPLETED" as const,
      conclusion: "CANCELLED" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/50",
      event: "pull_request",
      runId: "run-50",
      category: "failing" as const,
      failedStep: undefined,
    };
    const passingChecks = ["lint", "typecheck", "test", "e2e", "security"].map((name) => ({
      name,
      status: "COMPLETED" as const,
      conclusion: "SUCCESS" as const,
      detailsUrl: `https://github.com/owner/repo/actions/runs/${name}`,
      event: "pull_request",
      runId: `run-${name}`,
      category: "passed" as const,
    }));
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: passingChecks,
          failing: [infraCheck],
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
    // All 6 checks visible — the bug was that the failing infra check disappeared from output.
    expect(result.checks).toHaveLength(6);
    const failing = result.checks.find((c) => c.name === "build");
    expect(failing).toBeDefined();
    const passNames = result.checks
      .filter((c) => c.conclusion === "SUCCESS")
      .map((c) => c.name)
      .sort();
    expect(passNames).toEqual(["e2e", "lint", "security", "test", "typecheck"]);
  });
  it("cancelled+BEHIND → fix_code action with failing check still in base.checks", async () => {
    const cancelledCheck = {
      name: "ci",
      status: "COMPLETED" as const,
      conclusion: "CANCELLED" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/60",
      event: "pull_request",
      runId: "run-60",
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "BEHIND",
          state: "OPEN" as const,
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "BEHIND",
        },
        checks: {
          passing: [],
          failing: [cancelledCheck],
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
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.name).toBe("ci");
  });
  it("wait path includes passing checks in base.checks", async () => {
    mockRunCheck.mockResolvedValue(makeReport()); // 1 passing check: "ci"
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));

    expect(result.action).toBe("wait");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.name).toBe("ci");
    expect(result.checks[0]!.conclusion).toBe("SUCCESS");
  });
});
