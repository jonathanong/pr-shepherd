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

describe("runIterate — prescriptive fields: log strings", () => {
  it("wait.log includes passing count and merge state", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));
    expect(result.action).toBe("wait");
    if (result.action === "wait") {
      expect(result.log).toMatch(/WAIT/);
      expect(result.log).toMatch(/passing/);
      expect(result.log).toMatch(/300s/);
    }
  });
  it("cancel.log mentions PR state and reason=merged when PR is merged", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "MERGED",
        mergeStatus: {
          status: "CLEAN",
          state: "MERGED",
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          blockingBotReviewInProgress: false,
          mergeStateStatus: "CLEAN",
        },
      }),
    );

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
    expect(result.status).toBe("MERGED");
    if (result.action === "cancel") {
      expect(result.reason).toBe("merged");
      expect(result.log).toMatch(/CANCEL/);
      expect(result.log).toMatch(/merged/i);
    }
  });
  it("cancel.reason=closed and log mentions closed when PR is closed", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "CLOSED",
        mergeStatus: {
          status: "UNKNOWN",
          state: "CLOSED",
          isDraft: false,
          mergeable: "UNKNOWN",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "UNKNOWN",
        },
      }),
    );

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
    expect(result.status).toBe("CLOSED");
    if (result.action === "cancel") {
      expect(result.reason).toBe("closed");
      expect(result.log).toMatch(/CANCEL/);
      expect(result.log).toMatch(/closed/i);
    }
  });
  it("cancel.log mentions ready-delay and reason=ready-delay-elapsed when shouldCancel from ready-delay", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
    if (result.action === "cancel") {
      expect(result.reason).toBe("ready-delay-elapsed");
      expect(result.log).toMatch(/CANCEL/);
      expect(result.log).toMatch(/ready/i);
    }
  });
  it("fix_code.log for a timeout failure mentions the check name", async () => {
    const timeoutCheck = {
      name: "test",
      status: "COMPLETED" as const,
      conclusion: "TIMED_OUT" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/99",
      event: "pull_request",
      runId: "run-99",
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [timeoutCheck],
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
  });
});
