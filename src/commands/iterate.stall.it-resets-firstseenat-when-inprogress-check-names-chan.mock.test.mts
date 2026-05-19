import { describe, it, expect } from "vitest";
import {
  mockReadStallState,
  mockWriteStallState,
  STALL_TIMEOUT_S,
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
  it("resets firstSeenAt when inProgress check names change (exercises inProgress fingerprint path)", async () => {
    const inProgressCheck: import("../types.mts").ClassifiedCheck = {
      name: "ci-slow",
      status: "IN_PROGRESS",
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/1",
      event: "pull_request",
      runId: "run-1",
      category: "in_progress",
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        checks: {
          passing: [],
          failing: [],
          inProgress: [inProgressCheck],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;
    expect(fp1).toContain("inProgress:ci-slow");

    // Second call: inProgress is now empty (job completed) → fingerprint changes.
    mockWriteStallState.mockClear();
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.fingerprint).not.toBe(fp1);
  });
});
