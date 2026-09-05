/* eslint-disable max-lines */
import { describe, it, expect } from "vitest";
import {
  defaultConfig,
  registerIterateHooks,
  makeOpts,
  makeReport,
  makeReview,
  mockLoadConfig,
  mockReadFixAttempts,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { makeThread } from "../../test-helpers/commands/iterate-thread-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { hashBody } from "../state/seen-comments.mts";

registerIterateHooks();

const THREAD = makeThread();

function queuedReport(overrides: Parameters<typeof makeReport>[0] = {}) {
  return makeReport({
    status: "UNRESOLVED_COMMENTS",
    mergeQueue: {
      enabled: true,
      inQueue: true,
      entry: { position: 1, state: "AWAITING_CHECKS", estimatedTimeToMerge: null },
    },
    ...overrides,
  });
}

describe("runIterate — merge-queue work deferral", () => {
  it("defers an actionable thread while queued by default and reports deferredWork counts", async () => {
    mockRunCheck.mockResolvedValue(
      queuedReport({
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

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("wait");
    if (result.action === "wait") {
      expect(result.log).toContain("merge queue");
      expect(result.deferredWork).toEqual({
        threads: 1,
        comments: 0,
        changesRequestedReviews: 0,
        reviewSummaries: 0,
      });
    }
  });

  it("acts immediately on actionable work while queued when actions.workWhileQueued is true (same report, config toggle flips the action)", async () => {
    const report = queuedReport({
      threads: {
        actionable: [THREAD],
        resolutionOnly: [],
        autoResolved: [],
        autoResolveErrors: [],
        firstLook: [],
      },
    });
    mockRunCheck.mockResolvedValue(report);
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const deferred = await runIterate(makeOpts({ merge: true }));
    expect(deferred.action).toBe("wait");

    mockLoadConfig.mockReturnValue({
      ...defaultConfig(),
      actions: { ...defaultConfig().actions, workWhileQueued: true },
    });
    const immediate = await runIterate(makeOpts({ merge: true }));
    expect(immediate.action).toBe("fix_code");
  });

  it("does not act on actionable work while queued without --merge (queue awareness stays off)", async () => {
    mockRunCheck.mockResolvedValue(
      queuedReport({
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

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
  });

  it("does not escalate fix-thrash while deferred, but escalates once the PR leaves the queue", async () => {
    mockReadFixAttempts.mockResolvedValue({
      headSha: "abc123",
      threadAttempts: { "thread-1": 3 },
      threadBodyHashes: { "thread-1": hashBody(THREAD.body) },
    });
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const withThread = (inQueue: boolean) =>
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        mergeQueue: { enabled: true, inQueue },
        threads: {
          actionable: [THREAD],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      });

    mockRunCheck.mockResolvedValue(withThread(true));
    const queuedResult = await runIterate(makeOpts({ merge: true }));
    expect(queuedResult.action).toBe("wait");

    mockRunCheck.mockResolvedValue(withThread(false));
    const poppedResult = await runIterate(makeOpts({ merge: true }));
    expect(poppedResult.action).toBe("escalate");
    if (poppedResult.action === "escalate") {
      expect(poppedResult.escalate.triggers).toContain("fix-thrash");
    }
  });

  it("still routes a failing merge-group check to fix_code immediately while queued", async () => {
    mockRunCheck.mockResolvedValue(
      queuedReport({
        checks: {
          passing: [],
          failing: [
            {
              name: "tests",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/123",
              event: "merge_group",
              runId: "123",
              workflowName: "CI",
              category: "failing",
              scope: "merge_group",
              commitOid: "queue-commit",
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
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("fix_code");
  });

  it("still routes a CONFLICTS merge state to fix_code immediately while queued", async () => {
    mockRunCheck.mockResolvedValue(
      queuedReport({
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN",
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: "APPROVED",
          blockingBotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("fix_code");
  });

  it("counts surfaced approvals toward deferredWork.reviewSummaries when minimizeApprovals is enabled", async () => {
    mockLoadConfig.mockReturnValue({
      ...defaultConfig(),
      iterate: { ...defaultConfig().iterate, minimizeApprovals: true },
    });
    mockRunCheck.mockResolvedValue(
      queuedReport({
        approvedReviews: [
          {
            id: "appr-1",
            author: "reviewer2",
            authorType: "User",
            body: "",
            viewerCanMinimize: false,
          },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("wait");
    if (result.action === "wait") expect(result.deferredWork?.reviewSummaries).toBe(1);
  });

  it("does not defer (or mislabel as queued) actionable work under plain auto-merge with no queue membership", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        mergeQueue: {
          enabled: false,
          inQueue: false,
          autoMergeRequest: { mergeMethod: "SQUASH", enabledAtUnix: 1 },
        },
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

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("fix_code");
  });

  it("dedupes overlapping thread/comment/summary buckets by ID instead of double-counting", async () => {
    // Real classification buckets are not disjoint (e.g. classifyThreadVisibility returns an
    // unresolved outdated thread in both resolutionOnly and firstLook; a minimize-eligible
    // comment/summary appears in both its actionable/first-look bucket and the minimize-ID list).
    mockRunCheck.mockResolvedValue(
      queuedReport({
        threads: {
          actionable: [],
          resolutionOnly: [THREAD],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [{ ...THREAD, firstLookStatus: "outdated" }],
        },
        comments: {
          actionable: [
            {
              id: "c1",
              author: "bot",
              authorType: "Bot",
              body: "noise",
              createdAtUnix: 0,
              url: "",
              isMinimized: false,
            },
          ],
          minimizeIds: ["c1"],
          firstLook: [
            {
              id: "c2",
              author: "bot",
              authorType: "Bot",
              body: "minimized noise",
              createdAtUnix: 0,
              url: "",
              isMinimized: true,
              firstLookStatus: "minimized",
            },
          ],
        },
        // Eligible for minimize ("all" policy + viewerCanMinimize) → also collapses into the
        // minimize-ID set, exercising the same overlap for review summaries.
        firstLookSummaries: [makeReview("sum1", "reviewer", "first look")],
        editedSummaries: [makeReview("sum2", "reviewer", "edited")],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("wait");
    if (result.action === "wait") {
      expect(result.deferredWork?.threads).toBe(1);
      expect(result.deferredWork?.comments).toBe(2);
      expect(result.deferredWork?.reviewSummaries).toBe(2);
    }
  });

  it("omits deferredWork when queued with no actionable work at all", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ mergeQueue: { enabled: true, inQueue: true } }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("wait");
    if (result.action === "wait") expect(result.deferredWork).toBeUndefined();
  });
});
