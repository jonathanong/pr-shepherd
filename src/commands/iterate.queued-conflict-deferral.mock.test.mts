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

const THREAD = makeThread();

function conflictingReport(inQueue: boolean) {
  return makeReport({
    status: "FAILING",
    mergeStatus: {
      status: "CONFLICTS",
      state: "OPEN",
      isDraft: false,
      mergeable: "CONFLICTING",
      reviewDecision: "APPROVED",
      blockingBotReviewInProgress: false,
      mergeStateStatus: "DIRTY",
    },
    mergeQueue: { enabled: true, inQueue },
    threads: {
      actionable: [THREAD],
      resolutionOnly: [],
      autoResolved: [],
      autoResolveErrors: [],
      firstLook: [],
    },
  });
}

describe("runIterate — queued conflict defers review work", () => {
  it.each([{ merge: true }, { merge: false }])(
    "holds review threads back from a queued conflict triage (%o)",
    async (flags) => {
      mockRunCheck.mockResolvedValue(conflictingReport(true));
      mockUpdateReadyDelay.mockResolvedValue({
        isReady: false,
        shouldCancel: false,
        remainingSeconds: 600,
      });

      const result = await runIterate(makeOpts(flags));

      expect(result.action).toBe("triage");
      if (result.action !== "triage") return;
      expect(result.triage.threads).toEqual([]);
      expect(result.triage.resolveCommand.hasMutations).toBe(false);
      expect(result.triage.deferredWork).toEqual({
        threads: 1,
        comments: 0,
        changesRequestedReviews: 0,
        reviewSummaries: 0,
      });
      expect(result.triage.instructions[0]).toContain("(b) wait");
    },
  );

  it("does not count a deferred thread toward triage-thrash while the PR waits in the queue", async () => {
    mockReadFixAttempts.mockResolvedValue({
      headSha: "abc123",
      threadAttempts: { [THREAD.id]: 3 },
      threadBodyHashes: { [THREAD.id]: hashBody(THREAD.body) },
    });
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    mockRunCheck.mockResolvedValue(conflictingReport(true));
    const queued = await runIterate(makeOpts({ merge: true }));
    expect(queued.action).toBe("triage");
    const written = mockWriteFixAttempts.mock.calls.at(-1)?.[1];
    expect(written?.threadAttempts[THREAD.id]).toBe(3);

    mockRunCheck.mockResolvedValue(conflictingReport(false));
    const dequeued = await runIterate(makeOpts({ merge: true }));
    expect(dequeued.action).toBe("escalate");
  });
});
