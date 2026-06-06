import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeReport,
  mockExecFile,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { buildRelevantChecks, buildWaitLog, getCurrentHeadSha } from "./iterate/helpers.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Escalate
// ---------------------------------------------------------------------------

describe("iterate helper fallbacks", () => {
  it("returns null when current HEAD cannot be read", async () => {
    mockExecFile.mockRejectedValueOnce(new Error("not a git repo"));
    await expect(getCurrentHeadSha()).resolves.toBeNull();
  });

  it("covers relevant-check filtering and wait-log branches", () => {
    const report = makeReport({
      checks: {
        passing: [
          {
            name: "skipped",
            status: "COMPLETED",
            conclusion: "SKIPPED",
            detailsUrl: "",
            event: "pull_request",
            runId: "run-skip",
            category: "passed",
          },
        ],
        failing: [
          {
            name: "failed",
            status: "COMPLETED",
            conclusion: "FAILURE",
            detailsUrl: "",
            event: "pull_request",
            runId: "run-fail",
            category: "failing",
            workflowName: "CI",
            jobName: "test",
            failedStep: "Run tests",
            summary: "failed summary",
          },
        ],
        inProgress: [],
        skipped: [],
        filtered: [],
        filteredNames: [],
        blockedByFilteredCheck: false,

      },
    });

    expect(buildRelevantChecks(report).map((check) => check.name)).toEqual(["failed"]);
    expect(
      buildWaitLog({
        pr: 42,
        repo: "owner/repo",
        status: "IN_PROGRESS",
        state: "OPEN",
        mergeStateStatus: "BEHIND",
        mergeStatus: "BEHIND",
        reviewDecision: null,
        blockingBotReviewInProgress: false,
        isDraft: false,
        shouldCancel: false,
        remainingSeconds: 0,
        summary: { passing: 1, skipped: 0, filtered: 0, inProgress: 0 },
        baseBranch: "main",
        branchProtection: null,
        checks: [],
      }),
    ).toContain("branch is behind base");
  });

  it("covers draft and unstable wait-log branches", () => {
    const base = {
      pr: 42,
      repo: "owner/repo",
      status: "IN_PROGRESS" as const,
      state: "OPEN" as const,
      mergeStateStatus: "DRAFT" as const,
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      isDraft: false,
      shouldCancel: false,
      remainingSeconds: 0,
      summary: { passing: 1, skipped: 0, filtered: 0, inProgress: 0 },
      baseBranch: "main",
      branchProtection: null,
      checks: [],
    };

    expect(buildWaitLog({ ...base, mergeStatus: "DRAFT" })).toContain("PR is a draft");
    expect(buildWaitLog({ ...base, mergeStatus: "UNSTABLE" })).toContain(
      "some checks are unstable",
    );
  });
});
