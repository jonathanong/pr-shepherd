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
  mockExecFile,
  mockRunCheck,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// runIterate — stall-timeout guard
// ---------------------------------------------------------------------------

describe("runIterate — stall-timeout guard", () => {
  it("resets firstSeenAt when HEAD SHA changes", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    // First call with sha abc123.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: HEAD SHA changes to def456.
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") {
        return Promise.resolve({ stdout: "def456", stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.fingerprint).not.toBe(fp1); // headSha changed → fingerprint changed
    expect(written.firstSeenAt).toBe(NOW);
  });
});
