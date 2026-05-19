import { describe, it, expect } from "vitest";
import {
  mockReadStallState,
  mockWriteStallState,
  makeOpts30mStall,
} from "./iterate-stall.test-support.mts";
import type { StallState } from "./iterate-stall.test-support.mts";
import { registerIterateHooks, NOW, makeReport, mockRunCheck } from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// runIterate — stall-timeout guard
// ---------------------------------------------------------------------------

describe("runIterate — stall-timeout guard", () => {
  it("resets firstSeenAt when stored firstSeenAt is in the future (clock skew)", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    mockWriteStallState.mockClear();
    // firstSeenAt in the future → ageSeconds < 0 → clock-skew branch
    mockReadStallState.mockResolvedValue({ fingerprint: fp, firstSeenAt: NOW + 9999 });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    // Must reset to current time, not the future value
    expect(written.firstSeenAt).toBe(NOW);
  });
});
