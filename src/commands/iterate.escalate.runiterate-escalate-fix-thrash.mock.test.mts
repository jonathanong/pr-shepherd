import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockReadFixAttempts,
  mockRunCheck,
  mockUpdateReadyDelay,
  mockWriteFixAttempts,
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
  it("returns the pending command for three visible ticks before escalating with it", async () => {
    let persisted: Awaited<ReturnType<typeof mockReadFixAttempts>> = null;
    mockReadFixAttempts.mockImplementation(async () => persisted);
    mockWriteFixAttempts.mockImplementation(async (_key, state) => {
      persisted = state;
    });
    mockUnresolvedThreadReport();

    const deliveredCommands: string[][] = [];
    for (let tick = 0; tick < 3; tick += 1) {
      const result = await runIterate(makeOpts());
      expect(result.action).toBe("fix_code");
      if (result.action === "fix_code") deliveredCommands.push(result.fix.resolveCommand.argv);
    }

    expect(deliveredCommands).toHaveLength(3);
    expect(deliveredCommands[1]).toEqual(deliveredCommands[0]);
    expect(deliveredCommands[2]).toEqual(deliveredCommands[0]);

    const escalated = await runIterate(makeOpts());
    expect(escalated.action).toBe("escalate");
    if (escalated.action === "escalate") {
      expect(escalated.escalate.pendingReviewCommands?.resolveCommand?.argv).toEqual(
        deliveredCommands[0],
      );
      expect(escalated.escalate.thrashHistory).toEqual([{ threadId: THREAD.id, attempts: 3 }]);
    }
  });

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
      expect(result.escalate.pendingReviewCommands?.resolveCommand?.hasMutations).toBe(true);
    }
  });
  it("surfaces a first-look review summary before retaining its minimize mutation", async () => {
    mockReadFixAttempts.mockResolvedValue({
      headSha: "abc123",
      threadAttempts: { "thread-1": 3 },
      threadBodyHashes: { "thread-1": hashBody(THREAD.body) },
    });
    const summary = {
      id: "summary-1",
      author: "coderabbitai",
      authorType: "Bot" as const,
      body: "Read this summary before minimizing it.",
    };
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
        firstLookSummaries: [summary],
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.firstLookSummaries).toEqual([{ ...summary, viewerCanMinimize: true }]);
      const pendingArgv = [
        ...(result.escalate.pendingReviewCommands?.resolveOnlyCommand?.argv ?? []),
        ...(result.escalate.pendingReviewCommands?.resolveCommand?.argv ?? []),
      ];
      expect(pendingArgv).toContain(summary.id);
      expect(result.escalate.humanMessage).toContain(summary.body);
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
  it("accumulates attempt counts on a caller-visible tick and does NOT immediately escalate", async () => {
    // Stored state has 1 attempt — the visible tick increments to 2, still below threshold.
    mockReadFixAttempts.mockResolvedValue({
      headSha: "old-sha",
      threadAttempts: { "thread-1": 1 },
    });
    mockUnresolvedThreadReport();

    const result = await runIterate(makeOpts());

    // The body hash is unchanged, so counts increment (1→2) → below threshold → no escalation.
    expect(result.action).toBe("fix_code");
  });
});
