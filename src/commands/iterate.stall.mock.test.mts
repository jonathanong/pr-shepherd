import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mocks BEFORE any imports so modules capture the mocked versions.
// child_process is still used by iterate.mts for `git` calls only.
// GitHub API mutations now go through fetch (http.mts).
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    optsOrCb:
      | Record<string, unknown>
      | ((err: Error | null, result: { stdout: string; stderr: string }) => void),
    maybeCb?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb!;
    mockExecFile(cmd, args)
      .then((result: { stdout: string; stderr: string }) => cb(null, result))
      .catch((err: Error & { stderr?: string }) =>
        cb(err, { stdout: "", stderr: err.stderr ?? "" }),
      );
  },
}));

vi.mock("./check.mts", () => ({
  runCheck: vi.fn(),
}));

vi.mock("./ready-delay.mts", () => ({
  updateReadyDelay: vi.fn(),
}));

vi.mock("../github/client.mts", () => ({
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));

vi.mock("../state/fix-attempts.mts", () => ({
  readFixAttempts: vi.fn().mockResolvedValue(null),
  writeFixAttempts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../state/iterate-stall.mts", () => ({
  readStallState: vi.fn().mockResolvedValue(null),
  writeStallState: vi.fn().mockResolvedValue(undefined),
}));

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { runIterate } from "./iterate.mts";
import { runCheck } from "./check.mts";
import { updateReadyDelay } from "./ready-delay.mts";
import { readFixAttempts, writeFixAttempts } from "../state/fix-attempts.mts";
import { readStallState, writeStallState, type StallState } from "../state/iterate-stall.mts";
import type { ShepherdReport, IterateCommandOptions } from "../types.mts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRunCheck = vi.mocked(runCheck);
const mockUpdateReadyDelay = vi.mocked(updateReadyDelay);
const mockReadFixAttempts = vi.mocked(readFixAttempts);
const mockWriteFixAttempts = vi.mocked(writeFixAttempts);
const mockReadStallState = vi.mocked(readStallState);
const mockWriteStallState = vi.mocked(writeStallState);

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_kgDOAAA",
    repo: "owner/repo",
    status: "READY",
    baseBranch: "main",
    mergeStatus: {
      status: "CLEAN",
      state: "OPEN" as const,
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: "APPROVED",
      copilotReviewInProgress: false,
      mergeStateStatus: "CLEAN",
    },
    checks: {
      passing: [
        {
          name: "ci",
          status: "COMPLETED",
          conclusion: "SUCCESS",
          detailsUrl: "https://github.com/owner/repo/actions/runs/1",
          event: "pull_request",
          runId: "run-1",
          category: "passed",
        },
      ],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [] },
    comments: { actionable: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    ...overrides,
  };
}

function makeOpts(overrides: Partial<IterateCommandOptions> = {}): IterateCommandOptions {
  return {
    prNumber: 42,
    format: "json",
    cooldownSeconds: 30,
    readyDelaySeconds: 600,
    ...overrides,
  };
}

const NOW = 1_700_000_000;
const READY_STATE_DEFAULT = {
  isReady: true,
  shouldCancel: false,
  remainingSeconds: 300,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function defaultConfig() {
  return {
    iterate: {
      cooldownSeconds: 30,
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 30,
      minimizeApprovals: false,
    },
    watch: { interval: "4m", readyDelayMinutes: 10, expiresHours: 8, maxTurns: 50 },
    resolve: {
      concurrency: 4,
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
      fetchReviewSummaries: true,
    },
    checks: {
      ciTriggerEvents: ["pull_request", "pull_request_target"],
    },
    mergeStatus: { blockingReviewerLogins: ["copilot"] },
    actions: {
      autoResolveOutdated: true,
      autoMarkReady: true,
      commitSuggestions: true,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue(defaultConfig());
  process.env["GH_TOKEN"] = "test-token";
  // Default: last commit was 60s ago (outside cooldown)
  mockExecFile.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "log") {
      return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
    }
    if (cmd === "git" && args[0] === "rev-parse") {
      return Promise.resolve({ stdout: "abc123", stderr: "" });
    }
    return Promise.resolve({ stdout: "", stderr: "" });
  });
  // Default: all fetch calls succeed (mutations return 2xx with no body)
  mockFetch.mockResolvedValue({
    ok: true,
    status: 204,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
  });
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  mockUpdateReadyDelay.mockResolvedValue(READY_STATE_DEFAULT);
  mockReadFixAttempts.mockResolvedValue(null);
  mockWriteFixAttempts.mockResolvedValue(undefined);
  mockReadStallState.mockResolvedValue(null);
  mockWriteStallState.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// runIterate — stall-timeout guard
// ---------------------------------------------------------------------------

describe("runIterate — stall-timeout guard", () => {
  const STALL_TIMEOUT_S = 1800; // 30 minutes

  function makeOpts30mStall(overrides: Partial<IterateCommandOptions> = {}): IterateCommandOptions {
    return makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true, ...overrides });
  }

  it("writes stall state on first call (no stored state)", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue(null);

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("wait");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(Math.floor(NOW));
    expect(typeof written.fingerprint).toBe("string");
  });

  it("preserves firstSeenAt when fingerprint matches and threshold not yet met", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    const firstSeenAt = NOW - 60; // only 60s ago — well under 1800s
    mockReadStallState.mockResolvedValue({ fingerprint: "will-be-overridden", firstSeenAt });

    // First call: writes the real fingerprint with NOW as firstSeenAt (since stored fingerprint
    // won't match the computed one — null firstSeenAt means fresh state).
    // Simulate a matching fingerprint by running once to get the real fingerprint:
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const realFingerprint = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: stored state has the real fingerprint but only 60s old.
    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({ fingerprint: realFingerprint, firstSeenAt });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("wait");
    // writeStallState should NOT be called — we preserve firstSeenAt when within threshold.
    expect(mockWriteStallState).not.toHaveBeenCalled();
  });

  it("escalates with stall-timeout when threshold exceeded", async () => {
    mockRunCheck.mockResolvedValue(makeReport());

    // Get the real fingerprint first.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const realFingerprint = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: fingerprint matches but firstSeenAt is 1800s ago (exactly at threshold).
    mockWriteStallState.mockClear();
    const firstSeenAt = NOW - STALL_TIMEOUT_S;
    mockReadStallState.mockResolvedValue({ fingerprint: realFingerprint, firstSeenAt });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.triggers).toContain("stall-timeout");
    expect(result.escalate.suggestion).toMatch(/30 minutes/);
  });

  it("resets firstSeenAt when fingerprint changes (different failing checks)", async () => {
    // First call: passing report.
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: report changes (different check names).
    mockWriteStallState.mockClear();
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [
            {
              name: "unit-tests",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/99",
              event: "pull_request",
              runId: "run-99",
              category: "failing",
              failureKind: "actionable",
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
    // Stored state has the old fingerprint.
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    // Different fingerprint → no escalate; stall state is reset with new firstSeenAt.
    expect(result.action).not.toBe("escalate");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(NOW);
    expect(written.fingerprint).not.toBe(fp1);
  });

  it("resets firstSeenAt when HEAD SHA changes", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    // First call with sha abc123.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: HEAD SHA changes to def456.
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log") {
        return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
      }
      if (cmd === "git" && args[0] === "rev-parse") {
        return Promise.resolve({ stdout: "def456", stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });
    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.fingerprint).not.toBe(fp1); // headSha changed → fingerprint changed
    expect(written.firstSeenAt).toBe(NOW);
  });

  it("does not touch stall state on cooldown (pre-sweep early return)", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log") {
        return Promise.resolve({ stdout: String(NOW - 5), stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts30mStall({ cooldownSeconds: 30 }));

    expect(result.action).toBe("cooldown");
    expect(mockWriteStallState).not.toHaveBeenCalled();
    expect(mockReadStallState).not.toHaveBeenCalled();
  });

  it("does not touch stall state on cancel (ready-delay elapsed)", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts30mStall({ stallTimeoutSeconds: STALL_TIMEOUT_S }));

    expect(result.action).toBe("cancel");
    expect(mockWriteStallState).not.toHaveBeenCalled();
  });

  it("resets firstSeenAt when inProgress check names change (exercises inProgress fingerprint path)", async () => {
    const inProgressCheck: import("../types.mts").ClassifiedCheck = {
      name: "ci-slow",
      status: "IN_PROGRESS",
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/1",
      event: "pull_request",
      runId: "run-1",
      category: "in_progress",
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        checks: {
          passing: [],
          failing: [],
          inProgress: [inProgressCheck],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;
    expect(fp1).toContain("inProgress:ci-slow");

    // Second call: inProgress is now empty (job completed) → fingerprint changes.
    mockWriteStallState.mockClear();
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.fingerprint).not.toBe(fp1);
  });

  it("resets firstSeenAt when stored firstSeenAt is in the future (clock skew)", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    mockWriteStallState.mockClear();
    // firstSeenAt in the future → ageSeconds < 0 → clock-skew branch
    mockReadStallState.mockResolvedValue({ fingerprint: fp, firstSeenAt: NOW + 9999 });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    // Must reset to current time, not the future value
    expect(written.firstSeenAt).toBe(NOW);
  });

  it("respects stallTimeoutSeconds: 0 as never-stall and refreshes firstSeenAt", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    // First call to capture real fingerprint.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall({ stallTimeoutSeconds: 0 }));
    const realFp = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({ fingerprint: realFp, firstSeenAt: 0 }); // 0 = very old

    const result = await runIterate(makeOpts({ stallTimeoutSeconds: 0, noAutoMarkReady: true }));

    // stallTimeoutSeconds: 0 means "never escalate for stall", but still refreshes firstSeenAt
    // so that re-enabling stall detection starts a fresh timer.
    expect(result.action).toBe("wait");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(NOW);
    expect(written.fingerprint).toBe(realFp);
  });
});
