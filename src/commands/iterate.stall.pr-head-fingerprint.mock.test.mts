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
  const firstHead = "a".repeat(40);
  const nextHead = "b".repeat(40);

  it("fingerprints the PR head rather than the local checkout", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ headSha: firstHead }));
    mockReadStallState.mockResolvedValue({ ok: true, state: null });

    await runIterate(makeOpts30mStall());

    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(JSON.parse(written.fingerprint)).toMatchObject({ headSha: firstHead });
  });

  it("resets firstSeenAt when the PR head changes", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ headSha: firstHead }));
    mockReadStallState.mockResolvedValue({ ok: true, state: null });
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    mockRunCheck.mockResolvedValue(makeReport({ headSha: nextHead }));
    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({
      ok: true,
      state: { fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S },
    });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.fingerprint).not.toBe(fp1);
    expect(written.firstSeenAt).toBe(NOW);
  });
});
