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
  it("inProgressRunIds is empty for summary-only dispatch (no push possible, leave CI running)", async () => {
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

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      // Summary-only: no push possible, so in-progress runs are left alone
      expect(result.fix.inProgressRunIds).toHaveLength(0);
      // No cancel instruction emitted
      expect(result.fix.instructions.join("\n")).not.toMatch(/If you decide to push new commits/);
    }
  });
  it("inProgressRunIds is empty for resolution-only-thread dispatch (no push needed)", async () => {
    const inProgressCheck = {
      name: "ci",
      status: "IN_PROGRESS" as const,
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-in-3",
      event: "pull_request" as const,
      runId: "run-in-3",
      category: "in_progress" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        checks: {
          passing: [],
          failing: [],
          inProgress: [inProgressCheck],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
        threads: {
          actionable: [],
          resolutionOnly: [
            {
              id: "PRRT_outdated",
              isResolved: false,
              isOutdated: true,
              isMinimized: false,
              path: "src/a.ts",
              line: null,
              startLine: null,
              author: "reviewer",
              authorType: "Unknown" as const,
              body: "Already addressed",
              url: "",
              createdAtUnix: 0,
            },
          ],
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
    if (result.action === "fix_code") {
      // Resolution-only: just close the thread, no push needed
      expect(result.fix.inProgressRunIds).toHaveLength(0);
      expect(result.fix.instructions.join("\n")).not.toMatch(/If you decide to push new commits/);
    }
  });
});
