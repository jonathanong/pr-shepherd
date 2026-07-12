import { describe, it, expect } from "vitest";
import type { StallState } from "../../test-helpers/commands/iterate-stall.test-support.mts";
import {
  mockReadStallState,
  mockWriteStallState,
} from "../../test-helpers/commands/iterate-stall.test-support.mts";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockRunCheck,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// Regression test for https://github.com/jonathanong/pr-shepherd/issues/309: with a sub-minute
// --stall-timeout (e.g. `5s`), the escalate message must render the elapsed time in seconds, not
// floor it to "0 minutes".
describe("runIterate — sub-minute stall-timeout", () => {
  const STALL_TIMEOUT_S = 5;

  it("renders the stall duration in seconds when the timeout is under a minute", async () => {
    mockRunCheck.mockResolvedValue(makeReport());

    // Get the real fingerprint first.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }));
    const realFingerprint = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: fingerprint matches but firstSeenAt is 8s ago — past the 5s threshold.
    mockWriteStallState.mockClear();
    const firstSeenAt = NOW - 8;
    mockReadStallState.mockResolvedValue({ fingerprint: realFingerprint, firstSeenAt });

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }),
    );

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.triggers).toContain("stall-timeout");
    expect(result.escalate.suggestion).toContain("8 seconds —");
    expect(result.escalate.suggestion).not.toContain("0 minutes");
    expect(result.escalate.humanMessage).toContain("8 seconds —");
  });
});
