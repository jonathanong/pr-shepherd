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
  it("resets firstSeenAt when ruleAutoResolveIds change", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
          ruleAutoResolveIds: ["thread-2", "thread-1"],
        },
        ruleAutoResolveReviewSummaryIds: ["summary-2", "summary-1"],
      }),
    );
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    mockWriteStallState.mockClear();
    mockRunCheck.mockResolvedValue(
      makeReport({
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
          ruleAutoResolveIds: ["thread-1", "thread-3"],
        },
      }),
    );
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(NOW);
    expect(written.fingerprint).not.toBe(fp1);
  });

  it("resets firstSeenAt when fingerprint changes (different failing checks)", async () => {
    // First call: passing report.
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: report changes (different check names).
    mockWriteStallState.mockClear();
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [
            {
              name: "unit-tests",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/99",
              event: "pull_request",
              runId: "run-99",
              category: "failing",
            },
          ],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    // Stored state has the old fingerprint.
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    // Different fingerprint → no escalate; stall state is reset with new firstSeenAt.
    expect(result.action).not.toBe("escalate");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(NOW);
    expect(written.fingerprint).not.toBe(fp1);
  });
});
