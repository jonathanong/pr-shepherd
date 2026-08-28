import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — merge queue removal", () => {
  it("marks an eligible draft ready before an elapsed-delay merge", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        mergeStatus: {
          status: "DRAFT",
          state: "OPEN",
          isDraft: true,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          blockingBotReviewInProgress: false,
          mergeStateStatus: "CLEAN",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("mark_ready");
  });

  it("escalates a current ejection before a ready-delay merge", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        mergeQueue: {
          enabled: true,
          inQueue: false,
          latestRemoval: { reason: "MANUAL", createdAtUnix: 1_700_000_000 },
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.mergeQueueRemoval?.reason).toBe("MANUAL");
      expect(result.escalate.humanMessage).toContain(
        "pr-shepherd https://github.com/owner/repo/pull/42 --merge",
      );
    }
  });
});
