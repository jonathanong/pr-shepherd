// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mockReadStallState,
  mockWriteStallState,
  makeOpts30mStall,
} from "./iterate-stall.test-support.mts";
import type { StallState } from "./iterate-stall.test-support.mts";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockRunCheck,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// runIterate — stall-timeout guard
// ---------------------------------------------------------------------------

describe("runIterate — stall-timeout guard", () => {
  it("respects stallTimeoutSeconds: 0 as never-stall and refreshes firstSeenAt", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    // First call to capture real fingerprint.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall({ stallTimeoutSeconds: 0 }));
    const realFp = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({ fingerprint: realFp, firstSeenAt: 0 }); // 0 = very old

    const result = await runIterate(makeOpts({ stallTimeoutSeconds: 0, noAutoMarkReady: true }));

    // stallTimeoutSeconds: 0 means "never escalate for stall", but still refreshes firstSeenAt
    // so that re-enabling stall detection starts a fresh timer.
    expect(result.action).toBe("wait");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(NOW);
    expect(written.fingerprint).toBe(realFp);
  });
});
