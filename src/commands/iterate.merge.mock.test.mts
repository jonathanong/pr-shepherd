import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — merge", () => {
  it("emits an auto-merge plan after the ready delay", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({ status: "READY", headSha: "abc123", nodeId: "PR_node" }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("merge");
    if (result.action === "merge") {
      expect(result.merge.mode).toBe("auto");
      expect(result.merge.command.argv).toEqual([
        "gh",
        "pr",
        "merge",
        "42",
        "--repo",
        "owner/repo",
        "--match-head-commit",
        "abc123",
        "--auto",
        "--merge",
      ]);
      expect(result.merge.fallbackCommand?.argv).not.toContain("--auto");
    }
  });

  it("emits queue commands without configured ordinary merge options", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "def456",
        nodeId: "PR_node",
        mergeStatus: {
          status: "CLEAN",
          state: "OPEN",
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          blockingBotReviewInProgress: false,
          mergeStateStatus: "CLEAN",
          mergeRequirements: {
            approvals: { current: 1, requiredCount: 1 },
            conversationsResolved: { resolved: true, unresolvedCount: 0, required: true },
            mergeQueue: { required: true, enabled: true, inQueue: false },
          },
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("merge");
    if (result.action === "merge") {
      expect(result.merge.mode).toBe("queue");
      expect(result.merge.command.argv).not.toContain("--merge");
      expect(result.merge.queueApiFallbackCommand?.argv.join(" ")).toContain("enqueuePullRequest");
    }
  });

  it("waits without applying the stall guard while already queued", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        mergeQueue: {
          enabled: true,
          inQueue: true,
          entry: { position: 2, state: "AWAITING_CHECKS", estimatedTimeToMerge: null },
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
    if (result.action === "wait") expect(result.log).toContain("merge queue");
  });

  it("adds requeue commands to actionable work after an ejection", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeQueue: {
          enabled: true,
          inQueue: false,
          latestRemoval: {
            reason: "CI_FAILURE",
            createdAtUnix: 1_700_000_000,
            beforeCommitOid: "queue-old",
          },
        },
        checks: {
          passing: [],
          failing: [
            {
              name: "tests",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://example.test/check",
              event: "pull_request",
              runId: null,
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
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts({ merge: true, noAutoCancelActionable: true }));
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.requeue?.mode).toBe("queue");
      expect(result.fix.requeue?.command.argv).toContain("$HEAD_SHA");
    }
  });

  it("does not escalate an old ejection after the PR head was updated", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        mergeQueue: {
          enabled: true,
          inQueue: false,
          latestRemoval: { reason: "CI_FAILURE", createdAtUnix: 1_700_000_000 },
          headUpdatedAfterRemoval: true,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("wait");
  });
});
