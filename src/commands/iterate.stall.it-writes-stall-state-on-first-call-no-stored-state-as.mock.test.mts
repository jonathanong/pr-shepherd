// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  it("writes stall state on first call (no stored state)", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue(null);

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("wait");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(Math.floor(NOW));
    expect(typeof written.fingerprint).toBe("string");
  });
});
