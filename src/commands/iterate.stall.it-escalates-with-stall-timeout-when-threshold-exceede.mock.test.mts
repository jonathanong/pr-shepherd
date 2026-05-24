import { describe, it, expect } from "vitest";
import {
  mockReadStallState,
  mockWriteStallState,
  STALL_TIMEOUT_S,
  makeOpts30mStall,
} from "../../test-helpers/commands/iterate-stall.test-support.mts";
import type { StallState } from "../../test-helpers/commands/iterate-stall.test-support.mts";
import {
  registerIterateHooks,
  NOW,
  makeReport,
  mockRunCheck,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// runIterate — stall-timeout guard
// ---------------------------------------------------------------------------

describe("runIterate — stall-timeout guard", () => {
  it("escalates with stall-timeout when threshold exceeded", async () => {
    mockRunCheck.mockResolvedValue(makeReport());

    // Get the real fingerprint first.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const realFingerprint = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: fingerprint matches but firstSeenAt is 1800s ago (exactly at threshold).
    mockWriteStallState.mockClear();
    const firstSeenAt = NOW - STALL_TIMEOUT_S;
    mockReadStallState.mockResolvedValue({ fingerprint: realFingerprint, firstSeenAt });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.triggers).toContain("stall-timeout");
    expect(result.escalate.suggestion).toMatch(/30 minutes/);
  });
});
