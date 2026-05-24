import { describe, it, expect } from "vitest";
import {
  mockReadStallState,
  mockWriteStallState,
  STALL_TIMEOUT_S,
  RESOLUTION_ONLY_THREAD,
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
  it("includes resolution-only threads in stall-timeout escalation details", async () => {
    const report = makeReport({
      status: "UNRESOLVED_COMMENTS",
      threads: {
        actionable: [],
        resolutionOnly: [RESOLUTION_ONLY_THREAD],
        autoResolved: [],
        autoResolveErrors: [],
        firstLook: [],
      },
    });
    mockRunCheck.mockResolvedValue(report);

    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const realFingerprint = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({
      fingerprint: realFingerprint,
      firstSeenAt: NOW - STALL_TIMEOUT_S,
    });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.unresolvedThreads.map((t) => t.id)).toEqual(["thread-resolution-only"]);
    expect(result.escalate.humanMessage).toContain("thread-resolution-only");
  });
});
