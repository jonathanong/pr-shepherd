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

describe("runIterate — HAS_HOOKS (derived BLOCKED)", () => {
  function makeHasHooksReport(reviewDecision: "REVIEW_REQUIRED" | null) {
    return makeReport({
      status: "READY",
      mergeStatus: {
        status: "BLOCKED",
        state: "OPEN" as const,
        isDraft: false,
        mergeable: "MERGEABLE",
        reviewDecision,
        blockingBotReviewInProgress: false,
        mergeStateStatus: "HAS_HOOKS",
      },
    });
  }

  it("cancel-note uses branch-protection wording when raw is HAS_HOOKS", async () => {
    mockRunCheck.mockResolvedValue(makeHasHooksReport(null));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
    if (result.action === "cancel") {
      expect(result.log).toContain("branch protection");
      expect(result.log).not.toContain("ready for review");
    }
  });

  it("wait log uses branch-protection wording when raw is HAS_HOOKS", async () => {
    mockRunCheck.mockResolvedValue(makeHasHooksReport(null));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("wait");
    if (result.action === "wait") {
      expect(result.log).toContain("branch protection");
    }
  });
});
