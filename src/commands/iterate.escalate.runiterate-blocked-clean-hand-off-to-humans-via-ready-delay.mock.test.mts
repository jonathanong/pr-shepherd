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
// Escalate
// ---------------------------------------------------------------------------

function makeBlockedReadyReport(reviewDecision: "REVIEW_REQUIRED" | "APPROVED" | null) {
  return makeReport({
    status: "READY",
    mergeStatus: {
      status: "BLOCKED",
      state: "OPEN" as const,
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision,
      blockingBotReviewInProgress: false,
      mergeStateStatus: "CLEAN",
    },
  });
}

describe("runIterate — BLOCKED + clean (hand off to humans via ready-delay)", () => {
  it.each([
    ["REVIEW_REQUIRED", "REVIEW_REQUIRED" as const],
    ["APPROVED (insufficient approvals)", "APPROVED" as const],
    ["null (other branch protection)", null],
  ])(
    "reviewDecision=%s: wait during window then cancel after elapsed",
    async (_label, reviewDecision) => {
      mockRunCheck.mockResolvedValue(makeBlockedReadyReport(reviewDecision));

      mockUpdateReadyDelay.mockResolvedValue({
        isReady: true,
        shouldCancel: false,
        remainingSeconds: 300,
      });
      expect((await runIterate(makeOpts())).action).toBe("wait");

      mockUpdateReadyDelay.mockResolvedValue({
        isReady: true,
        shouldCancel: true,
        remainingSeconds: 0,
      });
      const result = await runIterate(makeOpts());
      expect(result.action).toBe("cancel");
      expect(result.shouldCancel).toBe(true);
    },
  );
});
