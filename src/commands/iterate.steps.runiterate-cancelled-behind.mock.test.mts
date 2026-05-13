// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — cancelled + BEHIND", () => {
  it("routes cancelled failure to fix_code (not rebase) when branch is BEHIND", async () => {
    const cancelledCheck = {
      name: "ci",
      status: "COMPLETED" as const,
      conclusion: "CANCELLED" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/30",
      event: "pull_request",
      runId: "run-30",
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
    expect(result.mergeStateStatus).toBe("BEHIND");
  });
});
