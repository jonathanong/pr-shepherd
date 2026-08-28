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
    }
  });
});
