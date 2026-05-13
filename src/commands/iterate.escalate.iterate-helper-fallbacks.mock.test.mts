// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerIterateHooks, NOW, makeReport, mockExecFile } from "./iterate-test-support.mts";
import { buildRelevantChecks, buildWaitLog, getCurrentHeadSha } from "./iterate/helpers.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Escalate
// ---------------------------------------------------------------------------

const THREAD = {
  id: "thread-1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "src/foo.mts",
  line: 10,
  startLine: null,
  author: "reviewer",
  authorType: "Unknown" as const,
  body: "Fix this",
  url: "",
  createdAtUnix: NOW - 3600,
};

const RESOLUTION_ONLY_THREAD = {
  ...THREAD,
  id: "thread-resolution-only",
  isOutdated: true,
  line: null,
  body: "Already addressed on an old diff",
};

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
      mergeStateStatus: "DRAFT",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      isDraft: false,
      shouldCancel: false,
      remainingSeconds: 0,
      summary: { passing: 1, skipped: 0, filtered: 0, inProgress: 0 },
      baseBranch: "main",
      checks: [],
    };

    expect(buildWaitLog({ ...base, mergeStatus: "DRAFT" })).toContain("PR is a draft");
    expect(buildWaitLog({ ...base, mergeStatus: "UNSTABLE" })).toContain(
      "some checks are unstable",
    );
  });
});
