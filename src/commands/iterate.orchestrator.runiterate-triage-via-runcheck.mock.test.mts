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

describe("runIterate — triage via runCheck", () => {
  it("returns action: cancel when PR is MERGED even with failing checks", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "MERGED",
        mergeStatus: {
          status: "UNKNOWN",
          state: "MERGED",
          isDraft: false,
          mergeable: "UNKNOWN",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "UNKNOWN",
        },
        checks: {
          passing: [],
          failing: [
            {
              name: "ci",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/1",
              event: "pull_request",
              runId: "run-1",
              category: "failing",
            },
          ],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(result.status).toBe("MERGED");
  });

  it("returns fix_code for CONFLICTS even with a failing check (CONFLICTS is always actionable)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN",
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
        checks: {
          passing: [],
          failing: [
            {
              name: "ci",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/2",
              event: "pull_request",
              runId: "run-2",
              category: "failing",
            },
          ],
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
  });

  it("surfaces failing check in fix payload with name and runId", async () => {
    const failingCheck = {
      name: "typecheck",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/3",
      event: "pull_request",
      runId: "run-3",
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [failingCheck],
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
    if (result.action === "fix_code") {
      expect(result.fix.checks).toHaveLength(1);
      expect(result.fix.checks[0]?.name).toBe("typecheck");
      expect(result.fix.checks[0]?.runId).toBe("run-3");
    }
  });
});
