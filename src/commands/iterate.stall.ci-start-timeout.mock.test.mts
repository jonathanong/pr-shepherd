import { describe, it, expect } from "vitest";
import { STALL_TIMEOUT_S } from "./iterate-stall.test-support.mts";
import {
  NOW,
  makeOpts,
  makeReport,
  mockReadStallState,
  mockRunCheck,
  registerIterateHooks,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";
import { projectIterateLean } from "../cli/iterate-lean.mts";
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

describe("runIterate — CI start stall timeout", () => {
  it("escalates when an external status context has been pending without starting past the threshold", async () => {
    mockInProgressCheck({
      ...statusContext(NOW - STALL_TIMEOUT_S),
      summary: "Waiting for external service",
    });

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }),
    );

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.triggers).toEqual(["stall-timeout"]);
    expect(result.escalate.stalledChecks).toEqual([
      expect.objectContaining({
        name: "UI Tests",
        source: "status_context",
        detailsUrl: "https://example.test/build/1",
        ageSeconds: STALL_TIMEOUT_S,
      }),
    ]);
    expect(formatIterateResult(result)).toContain("check `UI Tests`");
    expect(JSON.stringify(projectIterateLean(result))).toContain("stalledChecks");
    expect(mockReadStallState).not.toHaveBeenCalled();
  });

  it("escalates when a queued check run has not started past the threshold", async () => {
    mockInProgressCheck(checkRun());

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }),
    );

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.stalledChecks?.[0]).toMatchObject({
      name: "tests",
      status: "QUEUED",
      source: "check_run",
      runId: "123",
    });
  });

  it("keeps waiting for a younger pending status context", async () => {
    mockInProgressCheck(statusContext(NOW - STALL_TIMEOUT_S + 1));

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }),
    );

    expect(result.action).toBe("wait");
  });

  it("does not treat a started in-progress check run as a CI-start stall", async () => {
    mockInProgressCheck(
      checkRun({
        status: "IN_PROGRESS",
        startedAtUnix: NOW - STALL_TIMEOUT_S,
      }),
    );

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }),
    );

    expect(result.action).toBe("wait");
  });

  it("does not escalate for filtered non-PR event checks", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "IN_PROGRESS",
        checks: {
          passing: [],
          failing: [],
          inProgress: [],
          skipped: [],
          filtered: [checkRun({ event: "push" })],
          filteredNames: ["tests"],
          blockedByFilteredCheck: false,
        },
      }),
    );

    const result = await runIterate(
      makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true }),
    );

    expect(result.action).toBe("wait");
  });

  it("respects stallTimeoutSeconds: 0 for CI-start stalls", async () => {
    mockInProgressCheck(statusContext(NOW - 100_000));

    const result = await runIterate(makeOpts({ stallTimeoutSeconds: 0, noAutoMarkReady: true }));

    expect(result.action).toBe("wait");
  });
});
