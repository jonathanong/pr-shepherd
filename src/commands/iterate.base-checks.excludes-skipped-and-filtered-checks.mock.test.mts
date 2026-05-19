import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// base.checks — always carries all relevant checks regardless of action
// ---------------------------------------------------------------------------

describe("runIterate — base.checks carries passing + failing (regression: missing CI bug)", () => {
  it("skipped and filtered checks are excluded from base.checks", async () => {
    const skippedCheck = {
      name: "skipped-job",
      status: "COMPLETED" as const,
      conclusion: "SKIPPED" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/70",
      event: "pull_request",
      runId: "run-70",
      category: "skipped" as const,
    };
    const filteredCheck = {
      name: "windows-only",
      status: "COMPLETED" as const,
      conclusion: "SUCCESS" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/71",
      event: "pull_request",
      runId: "run-71",
      category: "filtered" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        checks: {
          passing: [],
          failing: [],
          inProgress: [],
          skipped: [skippedCheck],
          filtered: [filteredCheck],
          filteredNames: ["windows-only"],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));

    expect(result.action).toBe("wait");
    expect(result.checks).toEqual([]);
  });
  it("passing check with null detailsUrl maps to detailsUrl: null in base.checks", async () => {
    // Exercises the `c.detailsUrl || null` false branch in buildRelevantChecks when
    // detailsUrl is null (StatusContext checks have no detailsUrl).
    mockRunCheck.mockResolvedValue(
      makeReport({
        checks: {
          passing: [
            {
              name: "status-check",
              status: "COMPLETED" as const,
              conclusion: "SUCCESS" as const,
              detailsUrl: null as unknown as string,
              event: null,
              runId: null,
              category: "passed" as const,
            },
          ],
          failing: [],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));

    expect(result.action).toBe("wait");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.detailsUrl).toBeNull();
  });
});
