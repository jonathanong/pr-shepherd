import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — timeout/cancelled failures route to fix_code", () => {
  it("TIMED_OUT failures produce fix_code (not a separate rerun action)", async () => {
    const timeoutCheck1 = {
      name: "test-1",
      status: "COMPLETED" as const,
      conclusion: "TIMED_OUT" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/10",
      event: "pull_request",
      runId: "run-10",
      workflowName: "CI",
      category: "failing" as const,
    };
    const timeoutCheck2 = {
      name: "test-2",
      status: "COMPLETED" as const,
      conclusion: "TIMED_OUT" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/11",
      event: "pull_request",
      runId: "run-11",
      workflowName: "CI",
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [timeoutCheck1, timeoutCheck2],
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

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      // Both failing checks are in the fix payload so the agent can decide.
      expect(result.fix.checks.map((c) => c.runId)).toContain("run-10");
      expect(result.fix.checks.map((c) => c.runId)).toContain("run-11");
      // Instructions point the agent at the triage playbook to fetch logs and decide
      // rerun vs fix; the `gh run view --log-failed` mechanics now live in the
      // pr-shepherd skill's "CI failure triage" playbook, not in `## Instructions`.
      const joined = result.fix.instructions.join("\n");
      expect(joined).toContain("Triage every failure under `## Failing checks`");
    }
  });

  it("CANCELLED failures produce fix_code so the agent can decide rerun vs fix", async () => {
    const check1 = {
      name: "test-step-1",
      status: "COMPLETED" as const,
      conclusion: "CANCELLED" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/20",
      event: "pull_request",
      runId: "run-20",
      workflowName: "CI",
      category: "failing" as const,
    };
    const check2 = {
      name: "test-step-2",
      status: "COMPLETED" as const,
      conclusion: "CANCELLED" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/20",
      event: "pull_request",
      runId: "run-20",
      workflowName: "CI",
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [check1, check2],
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

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.checks.length).toBeGreaterThanOrEqual(1);
    }
  });
});
