import { describe, it, expect } from "vitest";
import {
  mockWriteStallState,
  STALL_TIMEOUT_S,
  makeOpts30mStall,
} from "./iterate-stall.test-support.mts";
import {
  registerIterateHooks,
  makeReport,
  mockClearStallState,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// runIterate — stall-timeout guard
// ---------------------------------------------------------------------------

describe("runIterate — stall-timeout guard", () => {
  it("clears stall state on cancel (ready-delay elapsed) so re-invocation starts fresh", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts30mStall({ stallTimeoutSeconds: STALL_TIMEOUT_S }));

    expect(result.action).toBe("cancel");
    expect(mockWriteStallState).not.toHaveBeenCalled();
    expect(mockClearStallState).toHaveBeenCalledOnce();
  });
});
