import { describe, it, expect } from "vitest";
import { STALL_TIMEOUT_S } from "../../test-helpers/commands/iterate-stall.test-support.mts";
import {
  NOW,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockWriteCiStartFollowUp,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";
import type { ClassifiedCheck } from "../types.mts";

registerIterateHooks();

function mockInProgressCheck(check: ClassifiedCheck): void {
  mockRunCheck.mockResolvedValue(
    makeReport({
      status: "IN_PROGRESS",
      checks: {
        passing: [],
        failing: [],
        skipped: [],
        filtered: [],
        filteredNames: [],
        blockedByFilteredCheck: false,
        inProgress: [check],
      },
    }),
  );
}

function statusContext(createdAtUnix: number): ClassifiedCheck {
  return {
    name: "UI Tests",
    status: "IN_PROGRESS",
    conclusion: null,
    source: "status_context",
    detailsUrl: "https://example.test/build/1",
    event: null,
    runId: null,
    createdAtUnix,
    category: "in_progress",
  };
}

function checkRun(overrides: Partial<ClassifiedCheck> = {}): ClassifiedCheck {
  return {
    name: "tests",
    status: "QUEUED",
    conclusion: null,
    source: "check_run",
    detailsUrl: "https://github.com/owner/repo/actions/runs/123/jobs/456",
    event: "pull_request",
    runId: "123",
    createdAtUnix: NOW - STALL_TIMEOUT_S - 1,
    category: "in_progress",
    ...overrides,
  };
}

describe("runIterate — CI start stall investigation", () => {
  it("investigates once before escalating checks that never started", async () => {
    mockInProgressCheck({ ...checkRun(), summary: "Waiting for runner" });

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }),
    );

    expect(result.action).toBe("triage");
    expect(mockWriteCiStartFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({ pr: 42 }),
      "unknown#tests",
    );
    const text = formatIterateResult(result);
    expect(text).toContain("`tests` [status: QUEUED] (run `123`");
    expect(text).toContain("Waiting for runner");
    expect(text).toContain('Playbook: "CI start stall"');
  });

  it("describes an unstarted external status and a check without a run", async () => {
    mockInProgressCheck(statusContext(NOW - STALL_TIMEOUT_S));
    const external = formatIterateResult(
      await runIterate(makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true })),
    );
    expect(external).toContain("(external status, https://example.test/build/1)");

    mockInProgressCheck(checkRun({ runId: null, detailsUrl: "" }));
    const bare = formatIterateResult(
      await runIterate(makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true })),
    );
    expect(bare).toContain("(no run)");
  });

  it("does not record the investigation on a debounce preview tick", async () => {
    mockInProgressCheck(checkRun());

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true, persistSeen: false }),
    );

    expect(result.action).toBe("triage");
    expect(mockWriteCiStartFollowUp).not.toHaveBeenCalled();
  });

  it("escalates at once when a stalled check waits on an environment approval", async () => {
    mockInProgressCheck(
      checkRun({
        status: "WAITING",
        pendingDeployments: [
          {
            environment: "production",
            currentUserCanApprove: false,
            reviewers: [{ type: "User", name: "alice" }],
          },
        ],
      }),
    );

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }),
    );

    expect(result.action).toBe("escalate");
    expect(mockWriteCiStartFollowUp).not.toHaveBeenCalled();
  });
});
