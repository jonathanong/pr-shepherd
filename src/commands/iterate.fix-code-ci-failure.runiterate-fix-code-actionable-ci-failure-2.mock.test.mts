// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockFetch,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
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
  it("returns fix_code with empty cancelled when all gh run cancel calls fail (regression: PR #2112)", async () => {
    const actionableCheck = makeActionableCheck("run-200");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [actionableCheck],
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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers(),
      text: () => Promise.resolve("Cannot cancel a workflow run that is completed"),
    });

    const result = await runIterate(makeOpts());

    // The fix_code decision must survive even when cancel side-effect fails entirely.
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.checks).toHaveLength(1);
      expect(result.cancelled).toEqual([]);
    }
  });
  it("silently swallows 'Cannot cancel a workflow run that is completed' — no stderr", async () => {
    const actionableCheck = makeActionableCheck("run-400");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [actionableCheck],
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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers(),
      text: () => Promise.resolve("Cannot cancel a workflow run that is completed"),
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const result = await runIterate(makeOpts());

      expect(result.action).toBe("fix_code");
      if (result.action === "fix_code") {
        expect(result.cancelled).toEqual([]);
      }
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });
  it("still logs stderr for unexpected gh run cancel errors", async () => {
    const actionableCheck = makeActionableCheck("run-401");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [actionableCheck],
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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: () => Promise.resolve("Forbidden"),
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      await runIterate(makeOpts());
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("cancel run run-401 failed (ignored)"),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
