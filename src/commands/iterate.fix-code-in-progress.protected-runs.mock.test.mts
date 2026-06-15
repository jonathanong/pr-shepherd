import { describe, it, expect } from "vitest";
import {
  registerHooks,
  makeOpts,
  makeReport,
  mockLoadConfig,
  mockRunCheck,
  mockActionableFixCodeTick,
} from "../../test-helpers/commands/iterate.fix-code-in-progress.test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerHooks();

describe("fix_code — protected in-progress runs", () => {
  it("excludes runs protected by workflow name", async () => {
    mockLoadConfig.mockReturnValue({
      iterate: {
        fixAttemptsPerThread: 3,
        stallTimeoutMinutes: 60,
        minimizeApprovals: false,
        minimizeComments: "all",
      },
      watch: { readyDelayMinutes: 10 },
      resolve: { concurrency: 4, shaPoll: { intervalMs: 2000, maxAttempts: 10 } },
      checks: { ciTriggerEvents: ["pull_request"] },
      mergeStatus: { blockingReviewerLogins: [] },
      actions: {
        autoResolveOutdated: false,
        autoMinimizeSuppressed: false,
        autoMarkReady: false,
        commitSuggestions: false,
        neverCancelRuns: ["Final Code Review"],
      },
      botUsernames: [],
      ignoreChecks: [],
    });
    const thread = {
      id: "PRRT_1",
      path: "src/a.ts",
      line: 1,
      startLine: null,
      body: "fix this",
      url: "https://github.com/owner/repo/pull/42#discussion_r1",
      author: "alice",
      authorType: "Unknown" as const,
      isOutdated: false,
      isResolved: false,
      isMinimized: false,
      createdAtUnix: 0,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        checks: {
          passing: [],
          failing: [],
          inProgress: [
            {
              name: "Claude Code Review",
              workflowName: "Final Code Review",
              status: "IN_PROGRESS" as const,
              conclusion: null,
              detailsUrl: "https://github.com/owner/repo/actions/runs/run-final-review",
              event: "pull_request" as const,
              runId: "run-final-review",
              category: "in_progress" as const,
            },
          ],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockActionableFixCodeTick();

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.inProgressRunIds).toEqual([]);
      expect(result.fix.protectedRuns).toEqual([
        {
          runId: "run-final-review",
          matchedPattern: "Final Code Review",
          workflowName: "Final Code Review",
          checkNames: ["Claude Code Review"],
        },
      ]);
    }
  });
});
