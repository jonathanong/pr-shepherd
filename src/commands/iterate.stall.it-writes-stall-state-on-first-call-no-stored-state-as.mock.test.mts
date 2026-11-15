import { describe, it, expect } from "vitest";
import {
  mockReadStallState,
  mockWriteStallState,
  makeOpts30mStall,
} from "../../test-helpers/commands/iterate-stall.test-support.mts";
import type { StallState } from "../../test-helpers/commands/iterate-stall.test-support.mts";
import {
  registerIterateHooks,
  NOW,
  makeReport,
  mockRunCheck,
  mockReadStallRepair,
  mockWriteStallRepair,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// runIterate — stall-timeout guard
// ---------------------------------------------------------------------------

describe("runIterate — stall-timeout guard", () => {
  it("writes stall state on first call (no stored state)", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue({ ok: true, state: null });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("wait");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(Math.floor(NOW));
    expect(typeof written.fingerprint).toBe("string");
  });

  it("repairs once when the new timer cannot be saved, then escalates stall-state-unavailable", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue({ ok: true, state: null });
    mockWriteStallState.mockResolvedValue({ ok: false, reason: "ENOSPC: no space" });

    const first = await runIterate(makeOpts30mStall());
    expect(first.action).toBe("triage");
    if (first.action === "triage") expect(first.triage.instructions[0]).toContain("ENOSPC");
    expect(mockWriteStallRepair).toHaveBeenCalledWith("owner/repo#42", "ENOSPC: no space");

    mockReadStallRepair.mockResolvedValue(true);
    const second = await runIterate(makeOpts30mStall());
    expect(second.action).toBe("escalate");
    if (second.action !== "escalate") return;
    expect(second.escalate.triggers).toEqual(["stall-state-unavailable"]);
    expect(second.escalate.suggestion).toContain("ENOSPC: no space");
  });
});
