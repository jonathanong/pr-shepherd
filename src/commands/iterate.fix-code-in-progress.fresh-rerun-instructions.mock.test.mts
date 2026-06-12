import { describe, it, expect } from "vitest";
import {
  registerHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockFetch,
  mockActionableFixCodeTick,
} from "../../test-helpers/commands/iterate.fix-code-in-progress.test-support.mts";
import { buildInProgressRunIds } from "./iterate/helpers.mts";
import { runIterate } from "./iterate/index.mts";

registerHooks();

const checkBase = {
  detailsUrl: "https://github.com/owner/repo/actions/runs/1",
  event: "pull_request" as const,
};

describe("fix_code — fresh rerun in-progress cancellation", () => {
  it("does not auto-cancel fresh queued reruns but keeps them cancellable before a push", async () => {
    const report = makeReport({
      status: "FAILING",
      checks: {
        passing: [],
        failing: [
          {
            ...checkBase,
            name: "ci",
            status: "COMPLETED" as const,
            conclusion: "FAILURE" as const,
            runId: "run-rerun-1",
            createdAtUnix: 100,
            startedAtUnix: 100,
            completedAtUnix: 200,
            category: "failing" as const,
          },
        ],
        inProgress: [
          {
            ...checkBase,
            name: "ci",
            status: "QUEUED" as const,
            conclusion: null,
            runId: "run-rerun-1",
            createdAtUnix: 100,
            updatedAtUnix: 201,
            category: "in_progress" as const,
          },
          {
            ...checkBase,
            name: "lint",
            status: "IN_PROGRESS" as const,
            conclusion: null,
            runId: "run-stale-1",
            createdAtUnix: 150,
            category: "in_progress" as const,
          },
        ],
        skipped: [],
        filtered: [],
        filteredNames: [],
        blockedByFilteredCheck: false,
      },
    });
    mockRunCheck.mockResolvedValue(report);
    mockActionableFixCodeTick();

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.inProgressRunIds).toContain("run-rerun-1");
      expect(result.fix.inProgressRunIds).toContain("run-stale-1");
      expect(mockFetch).not.toHaveBeenCalled();
    }
  });
  it("auto-cancels a shared run after a different current-attempt job has failed", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [
            {
              ...checkBase,
              name: "lint",
              status: "COMPLETED" as const,
              conclusion: "FAILURE" as const,
              runId: "run-current",
              startedAtUnix: 201,
              completedAtUnix: 202,
              category: "failing" as const,
            },
          ],
          inProgress: [
            {
              ...checkBase,
              name: "ci",
              status: "IN_PROGRESS" as const,
              conclusion: null,
              runId: "run-current",
              startedAtUnix: 201,
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

    await runIterate(makeOpts());

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it("matches null-run reruns by check name", () => {
    const report = makeReport({
      status: "FAILING",
      checks: {
        passing: [],
        failing: [
          {
            ...checkBase,
            name: "external",
            status: "COMPLETED" as const,
            conclusion: "FAILURE" as const,
            runId: null,
            completedAtUnix: 200,
            category: "failing" as const,
          },
        ],
        inProgress: [
          {
            ...checkBase,
            name: "external",
            status: "IN_PROGRESS" as const,
            conclusion: null,
            runId: null,
            startedAtUnix: 200,
            category: "in_progress" as const,
          },
        ],
        skipped: [],
        filtered: [],
        filteredNames: [],
        blockedByFilteredCheck: false,
      },
    });

    expect(buildInProgressRunIds(report, new Set())).toEqual([]);
  });
});
