import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockFetch,
  mockRunCheck,
  mockUpdateReadyDelay,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("fix_code — GitHub Actions authorization", () => {
  it("does not cancel or recommend cancelling workflow runs without an exact capability", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [
            {
              name: "tests",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/123",
              event: "pull_request",
              runId: "123",
              category: "failing",
            },
          ],
          inProgress: [
            {
              name: "lint",
              status: "IN_PROGRESS",
              conclusion: null,
              detailsUrl: "https://github.com/owner/repo/actions/runs/456",
              event: "pull_request",
              runId: "456",
              category: "in_progress",
            },
          ],
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
    expect(result.cancelled).toEqual([]);
    expect(result.fix.inProgressRunIds).toEqual([]);
    expect(result.fix.instructions.join("\n")).not.toContain("gh run cancel");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
