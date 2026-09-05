/* eslint-disable max-lines */
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

/** Shared CLEAN mergeStatus fixture for a ready PR whose merge requirements include a required, enabled merge queue. */
function queueReadyMergeStatus() {
  return {
    status: "CLEAN" as const,
    state: "OPEN" as const,
    isDraft: false,
    mergeable: "MERGEABLE" as const,
    reviewDecision: "APPROVED" as const,
    blockingBotReviewInProgress: false,
    mergeStateStatus: "CLEAN" as const,
    mergeRequirements: {
      approvals: { current: 1, requiredCount: 1 },
      conversationsResolved: { resolved: true, unresolvedCount: 0, required: true },
      mergeQueue: { required: true, enabled: true, inQueue: false },
    },
  };
}

/** Shared CLEAN mergeStatus fixture for a ready PR that is part of a native GitHub stack. */
function stackedReadyMergeStatus(stack: {
  number: number;
  size: number;
  position: number;
  baseRefName: string;
}) {
  return {
    status: "CLEAN" as const,
    state: "OPEN" as const,
    isDraft: false,
    mergeable: "MERGEABLE" as const,
    reviewDecision: "APPROVED" as const,
    blockingBotReviewInProgress: false,
    mergeStateStatus: "CLEAN" as const,
    mergeRequirements: {
      approvals: { current: 1, requiredCount: 1 },
      conversationsResolved: { resolved: true, unresolvedCount: 0, required: true },
      stack,
    },
  };
}

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
      expect(result.merge.fallbackCommand?.argv).toEqual([
        "gh",
        "pr",
        "merge",
        "42",
        "--repo",
        "owner/repo",
        "--match-head-commit",
        "abc123",
        "--merge",
      ]);
    }
  });

  it("emits the requested ordinary merge plan when the capability snapshot is false", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "abc123",
        viewerAuthorization: {
          repositoryPermission: "READ",
          viewerCanAdminister: false,
          viewerDidAuthor: false,
          viewerCanUpdate: false,
          viewerCanEnableAutoMerge: false,
          viewerCanEditFiles: false,
          headRepositoryPermission: null,
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
    if (result.action === "merge") expect(result.merge.fallbackCommand).toBeDefined();
  });

  it("emits the requested ordinary merge plan when capability data is missing", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({ status: "READY", headSha: "abc123", viewerAuthorization: undefined }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("merge");
  });

  it("emits an enqueue plan for a merge-queue PR when the viewer can enable auto-merge", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "def456",
        nodeId: "PR_node",
        mergeStatus: queueReadyMergeStatus(),
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
      expect(result.merge.command.argv).toEqual([
        "gh",
        "pr",
        "merge",
        "42",
        "--repo",
        "owner/repo",
        "--match-head-commit",
        "def456",
      ]);
      expect(result.merge.queueApiFallbackCommand).toBeDefined();
    }
  });

  it("emits the requested queue plan when GitHub exposes no exact viewer capability", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "def456",
        nodeId: "PR_node",
        viewerAuthorization: {
          repositoryPermission: "READ",
          viewerCanAdminister: false,
          viewerDidAuthor: false,
          viewerCanUpdate: false,
          viewerCanEnableAutoMerge: false,
          viewerCanEditFiles: false,
          headRepositoryPermission: null,
        },
        mergeStatus: queueReadyMergeStatus(),
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
      expect(result.merge.queueApiFallbackCommand).toBeDefined();
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

  it("preserves the normal ready state when merge mode is disabled", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        mergeQueue: { enabled: true, inQueue: true },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
  });

  it("does not add unverifiable requeue commands to actionable work after an ejection", async () => {
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
              detailsUrl: "https://github.com/owner/repo/actions/runs/123",
              event: "pull_request",
              runId: "123",
              workflowName: "CI",
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
      expect(result.fix.requeue).toBeUndefined();
    }
  });

  it("declines to plan a merge for a PR stacked at position 1, escalating instead", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "abc123",
        nodeId: "PR_node",
        mergeStatus: stackedReadyMergeStatus({
          number: 7,
          size: 3,
          position: 1,
          baseRefName: "main",
        }),
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("escalate");
    expect("merge" in result).toBe(false);
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toEqual(["stacked-pr"]);
      expect(result.escalate.humanMessage).toContain("layer: `1` of `3` in stack `7`");
      expect(result.escalate.humanMessage).toContain("stack base: `main`");
      expect(result.escalate.humanMessage).toContain("gh stack merge --squash 42");
    }
    expect(JSON.stringify(result)).not.toContain("--auto");
  });

  it("declines to plan a merge for a PR stacked mid-stack with an unmerged parent, escalating instead", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "def456",
        nodeId: "PR_node",
        mergeStatus: stackedReadyMergeStatus({
          number: 7,
          size: 3,
          position: 2,
          baseRefName: "stack/7/1",
        }),
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("escalate");
    expect("merge" in result).toBe(false);
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toEqual(["stacked-pr"]);
      expect(result.escalate.humanMessage).toContain("layer: `2` of `3` in stack `7`");
      expect(result.escalate.humanMessage).toContain("stack base: `stack/7/1`");
      expect(result.escalate.humanMessage).toContain("gh stack merge --squash 42");
    }
    expect(JSON.stringify(result)).not.toContain("--auto");
  });

  it("falls through to cancel for a stacked PR when merge mode is not enabled", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "abc123",
        nodeId: "PR_node",
        mergeStatus: stackedReadyMergeStatus({
          number: 7,
          size: 3,
          position: 1,
          baseRefName: "main",
        }),
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: false }));

    expect(result.action).toBe("cancel");
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
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("merge");
  });
});
