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
  it("calls gh run cancel and returns action: fix_code (all succeed)", async () => {
    const actionableCheck = makeActionableCheck("run-99");
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

    const result = await runIterate(makeOpts());

    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo");
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.checks).toHaveLength(1);
      expect(result.cancelled).toEqual(["run-99"]);
      const joined = result.fix.instructions.join("\n");
      // cancelled > 0 + push → no-recancel warning present
      expect(joined).toContain("Do not re-run `gh run cancel`");
      // any push → stop-iteration instruction present
      expect(joined).toContain("Stop this iteration");
    }
    const cancelCall = (mockFetch.mock.calls as Array<[string, RequestInit]>).find(([url]) =>
      url.includes("run-99/cancel"),
    );
    expect(cancelCall).toBeDefined();
    expect(cancelCall![1].method).toBe("POST");
  });
  it("returns fix_code with partial cancelled when one gh run cancel fails", async () => {
    const check1 = makeActionableCheck("run-100", "typecheck");
    const check2 = makeActionableCheck("run-101", "lint");
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

        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    mockFetch.mockImplementation((url: string) => {
      if ((url as string).includes("run-100/cancel")) {
        return Promise.resolve({
          ok: false,
          status: 409,
          headers: new Headers(),
          text: () => Promise.resolve("Cannot cancel a workflow run that is completed"),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 202,
        headers: new Headers(),
        text: () => Promise.resolve(""),
      });
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.checks).toHaveLength(2);
      expect(result.cancelled).toEqual(["run-101"]);
    }
  });
});
