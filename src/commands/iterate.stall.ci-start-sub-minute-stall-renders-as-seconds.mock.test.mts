import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockRunCheck,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import type { ClassifiedCheck } from "../types.mts";

registerIterateHooks();

// Regression test for https://github.com/jonathanong/pr-shepherd/issues/309: an unstarted CI check
// escalating past a sub-minute --stall-timeout must render its wait time in seconds, not "0 minutes".
describe("runIterate — CI start stall timeout, sub-minute threshold", () => {
  it("renders the stalled-check wait time in seconds", async () => {
    const STALL_TIMEOUT_S = 5;
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "IN_PROGRESS",
        checks: {
          passing: [],
          failing: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
          inProgress: [
            {
              name: "UI Tests",
              status: "IN_PROGRESS",
              conclusion: null,
              source: "status_context",
              detailsUrl: "https://example.test/build/1",
              event: null,
              runId: null,
              createdAtUnix: NOW - 8,
              category: "in_progress",
            } satisfies ClassifiedCheck,
          ],
        },
      }),
    );

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }),
    );

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.humanMessage).toContain("waiting 8 seconds");
    expect(result.escalate.humanMessage).not.toContain("0 minutes");
  });
});
