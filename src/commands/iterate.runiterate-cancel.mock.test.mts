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

describe("runIterate — cancel", () => {
  it("returns action: cancel when shouldCancel is true", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(result.shouldCancel).toBe(true);
    expect(result.remainingSeconds).toBe(0);
  });

  it("does not cancel from a stale ready-delay marker when READY has fix_code work", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        firstLookSummaries: [
          {
            id: "review-1",
            author: "reviewer-bot",
            authorType: "Bot",
            body: "Looks good overall.",
          },
        ],
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
    expect(result.shouldCancel).toBe(false);
  });

  it("resets ready-delay when READY has pending comment minimization", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        comments: { actionable: [], firstLook: [], minimizeIds: ["comment-1"] },
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
      expect(result.fix.reviewSummaryIds).toHaveLength(0);
      expect(result.fix.resolveCommand.hasMutations).toBe(true);
    }
  });
});
