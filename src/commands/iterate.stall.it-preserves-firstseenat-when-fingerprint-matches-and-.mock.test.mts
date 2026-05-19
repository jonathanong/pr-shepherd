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
  it("preserves firstSeenAt when fingerprint matches and threshold not yet met", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    const firstSeenAt = NOW - 60; // only 60s ago — well under 1800s
    mockReadStallState.mockResolvedValue({ fingerprint: "will-be-overridden", firstSeenAt });

    // First call: writes the real fingerprint with NOW as firstSeenAt (since stored fingerprint
    // won't match the computed one — null firstSeenAt means fresh state).
    // Simulate a matching fingerprint by running once to get the real fingerprint:
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const realFingerprint = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: stored state has the real fingerprint but only 60s old.
    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({ fingerprint: realFingerprint, firstSeenAt });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("wait");
    // writeStallState should NOT be called — we preserve firstSeenAt when within threshold.
    expect(mockWriteStallState).not.toHaveBeenCalled();
  });
});
