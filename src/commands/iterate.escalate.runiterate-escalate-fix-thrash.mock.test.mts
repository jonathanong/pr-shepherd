import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockReadFixAttempts,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { makeThread } from "../../test-helpers/commands/iterate-thread-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { hashBody } from "../state/seen-comments.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Escalate
// ---------------------------------------------------------------------------

const THREAD = makeThread();

function mockUnresolvedThreadReport(): void {
  mockRunCheck.mockResolvedValue(
    makeReport({
      status: "UNRESOLVED_COMMENTS",
      threads: {
        actionable: [THREAD],
        resolutionOnly: [],
        autoResolved: [],
        autoResolveErrors: [],
        firstLook: [],
      },
    }),
  );
  mockUpdateReadyDelay.mockResolvedValue({
    isReady: false,
    shouldCancel: false,
    remainingSeconds: 600,
  });
}

describe("runIterate — escalate (fix-thrash)", () => {
  it("escalates when a thread has been attempted >= fixAttemptsPerThread times", async () => {
    mockReadFixAttempts.mockResolvedValue({
      headSha: "abc123",
      threadAttempts: { "thread-1": 3 },
      threadBodyHashes: { "thread-1": hashBody(THREAD.body) },
    });
    mockUnresolvedThreadReport();

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("fix-thrash");
      expect(result.escalate.thrashHistory).toHaveLength(1);
      expect(result.escalate.thrashHistory?.[0]?.threadId).toBe("thread-1");
      expect(result.escalate.thrashHistory?.[0]?.attempts).toBe(3);
    }
  });
  it("does NOT escalate immediately when legacy attempt state has no body hash and HEAD changed", async () => {
    mockReadFixAttempts.mockResolvedValue({
      headSha: "old-sha",
      threadAttempts: { "thread-1": 3 },
    });
    mockUnresolvedThreadReport();

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
  });
  it("does NOT escalate when attempt count is below threshold (attempt=2)", async () => {
    mockReadFixAttempts.mockResolvedValue({ headSha: "abc123", threadAttempts: { "thread-1": 2 } });
    mockUnresolvedThreadReport();

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
  });
  it("accumulates attempt counts when HEAD SHA changes and does NOT immediately escalate", async () => {
    // Stored state has SHA 'old-sha' with 1 attempt — new SHA triggers increment to 2, still below threshold.
    mockReadFixAttempts.mockResolvedValue({
      headSha: "old-sha",
      threadAttempts: { "thread-1": 1 },
    });
    mockUnresolvedThreadReport();

    const result = await runIterate(makeOpts());

    // Old SHA 'old-sha' ≠ current 'abc123' → counts increment (1→2) → below threshold → no escalation.
    expect(result.action).toBe("fix_code");
  });
});
