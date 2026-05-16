// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  makeOpts,
  makeReport,
  mockFetch,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate.fix-code-in-progress.test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerHooks();

describe("fix_code — in-progress run cancellation", () => {
  it("inProgressRunIds populated from inProgress checks, excluding CLI-cancelled IDs", async () => {
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
    const inProgressCheck = {
      name: "ci",
      status: "IN_PROGRESS" as const,
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-in-1",
      event: "pull_request" as const,
      runId: "run-in-1",
      category: "in_progress" as const,
    };
    // Failing check: CLI will cancel this runId; must NOT appear in inProgressRunIds.
    const failingCheck = {
      name: "lint",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-fail-1",
      event: "pull_request" as const,
      runId: "run-fail-1",
      summary: "tests failed",
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        checks: {
          passing: [],
          failing: [failingCheck],
          inProgress: [inProgressCheck],
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
    // Stub cancel REST call so the CLI "cancels" run-fail-1.
    mockFetch.mockResolvedValue({ ok: true, status: 202, json: async () => ({}) });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.inProgressRunIds).toContain("run-in-1");
      expect(result.fix.inProgressRunIds).not.toContain("run-fail-1");
      // Instruction is conditional on whether agent decides to push
      expect(result.fix.instructions.join("\n")).toMatch(/If you decide to push new commits/);
    }
  });
  it("inProgressRunIds is populated for summary-only dispatch (agent decides whether to cancel)", async () => {
    const inProgressCheck = {
      name: "ci",
      status: "IN_PROGRESS" as const,
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-in-2",
      event: "pull_request" as const,
      runId: "run-in-2",
      category: "in_progress" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        checks: {
          passing: [],
          failing: [],
          inProgress: [inProgressCheck],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
        reviewSummaries: [
          { id: "PRR_BOT", author: "bot", authorType: "Unknown" as const, body: "looks good" },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    if (result.action === "fix_code") {
      // inProgressRunIds is always populated; the agent decides whether to cancel
      expect(result.fix.inProgressRunIds).toContain("run-in-2");
      expect(result.fix.instructions.join("\n")).toMatch(/If you decide to push new commits/);
    }
  });
});
