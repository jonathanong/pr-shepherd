// @ts-nocheck
/**
 * Shared test harness for test-cases/index.test.mts.
 *
 * Mocks at the GitHub-API boundary (fetchPrBatch, getMergeableState, triage, etc.)
 * and drives runIterate end-to-end via main() — exercising argument parsing,
 * all decision logic, and both text + JSON formatters.
 */
import { vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Global stubs (evaluated before imports)
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../../src/config/load.mts", () => ({ loadConfig: mockLoadConfig }));

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFile: (cmd, args, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb;
    mockExecFile(cmd, args)
      .then((r) => cb(null, r))
      .catch((e) => cb(e, { stdout: "", stderr: e?.stderr ?? "" }));
  },
}));

vi.mock("../../src/github/batch.mts", () => ({ fetchPrBatch: vi.fn() }));
vi.mock("../../src/github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getMergeableState: vi.fn(),
}));
vi.mock("../../src/checks/triage.mts", () => ({
  triageFailingChecks: vi.fn((checks) => Promise.resolve(checks)),
  fetchStartupFailureChecks: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/github/check-annotations.mts", () => ({
  fetchCheckRunAnnotations: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/comments/resolve.mts", () => ({
  autoResolveOutdated: vi.fn().mockResolvedValue({ resolved: [], errors: [] }),
  applyResolveOptions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadSeenMap: vi.fn().mockResolvedValue(new Map()),
    markSeen: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("../../src/commands/ready-delay.mts", () => ({ updateReadyDelay: vi.fn() }));
vi.mock("../../src/state/iterate-stall.mts", () => ({
  readStallState: vi.fn().mockResolvedValue(null),
  writeStallState: vi.fn().mockResolvedValue(undefined),
  clearStallState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/state/fix-attempts.mts", () => ({
  readFixAttempts: vi.fn().mockResolvedValue(null),
  writeFixAttempts: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { main } from "../../src/cli-parser.mts";
import { fetchPrBatch } from "../../src/github/batch.mts";
import { getMergeableState } from "../../src/github/client.mts";
import { triageFailingChecks, fetchStartupFailureChecks } from "../../src/checks/triage.mts";
import { fetchCheckRunAnnotations } from "../../src/github/check-annotations.mts";
import { autoResolveOutdated } from "../../src/comments/resolve.mts";
import { loadSeenMap, markSeen } from "../../src/state/seen-comments.mts";
import { updateReadyDelay } from "../../src/commands/ready-delay.mts";
import {
  readStallState,
  writeStallState,
  clearStallState,
} from "../../src/state/iterate-stall.mts";
import { readFixAttempts, writeFixAttempts } from "../../src/state/fix-attempts.mts";

const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockGetMergeableState = vi.mocked(getMergeableState);
const mockTriageFailingChecks = vi.mocked(triageFailingChecks);
const mockFetchStartupFailureChecks = vi.mocked(fetchStartupFailureChecks);
const mockFetchCheckRunAnnotations = vi.mocked(fetchCheckRunAnnotations);
const mockAutoResolveOutdated = vi.mocked(autoResolveOutdated);
const mockLoadSeenMap = vi.mocked(loadSeenMap);
const mockMarkSeen = vi.mocked(markSeen);
const mockUpdateReadyDelay = vi.mocked(updateReadyDelay);
const mockReadStallState = vi.mocked(readStallState);
const mockWriteStallState = vi.mocked(writeStallState);
const mockClearStallState = vi.mocked(clearStallState);
const mockReadFixAttempts = vi.mocked(readFixAttempts);
const mockWriteFixAttempts = vi.mocked(writeFixAttempts);

// ---------------------------------------------------------------------------
// Fixture type
// ---------------------------------------------------------------------------

export interface Fixture {
  /** Fields merged on top of DEFAULT_BATCH. */
  batchData?: Record<string, unknown>;
  /** Return value of getMergeableState() for UNKNOWN/READY refresh. */
  mergeableFallback?: { mergeable: string; mergeStateStatus: string };
  /** If set, triageFailingChecks() returns this instead of passing through. */
  triagedChecks?: unknown[];
  /** Return value of fetchStartupFailureChecks(). */
  startupFailureChecks?: unknown[];
  /** Return values of fetchCheckRunAnnotations(), keyed by CheckRun node ID. */
  checkAnnotationsByCheckId?: Record<string, unknown[]>;
  /** Return value of loadSeenMap() — keys are item IDs. */
  seenMap?: Record<string, { seenAt: number; bodyHash: string }>;
  /** Return value of autoResolveOutdated(). */
  autoResolveResult?: { resolved: string[]; errors: Array<{ id: string; error: string }> };
  /** Deep-merged on top of defaultConfig(). */
  config?: Record<string, unknown>;
  /** Return value of updateReadyDelay(). */
  readyDelayState?: { isReady: boolean; shouldCancel: boolean; remainingSeconds: number };
  /**
   * "two-tick": run tick-1 (captures stall fingerprint), then tick-2 with
   * firstSeenAt far in the past so applyStallGuard fires escalation.
   * Snapshot is taken from tick-2 output.
   */
  stallMode?: "two-tick";
  /** Override stallTimeoutMinutes in config (in minutes). Defaults to 30. */
  stallTimeoutMinutes?: number;
  /** Return value of readFixAttempts(). */
  fixAttempts?: {
    headSha: string;
    threadAttempts: Record<string, number>;
    threadBodyHashes?: Record<string, string>;
  };
  /** If true, REST cancel calls return HTTP 409. */
  cancelRunsFail?: boolean;
  /** Extra CLI args appended after "42". */
  args?: string[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_BATCH = {
  nodeId: "PR_kwDOAAAAAAA",
  number: 42,
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: "APPROVED",
  headRefOid: "abc123",
  headRefName: "feature",
  headRepoWithOwner: "owner/repo",
  baseRefName: "main",
  reviewRequests: [],
  latestReviews: [],
  reviewThreads: [],
  comments: [],
  changesRequestedReviews: [],
  reviewSummaries: [],
  approvedReviews: [],
  checks: [],
};

export function defaultConfig() {
  return {
    botUsernames: ["coderabbitai"],
    iterate: {
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 30,
      minimizeApprovals: false,
      minimizeComments: "all",
    },
    watch: { readyDelayMinutes: 10 },
    resolve: {
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
      fetchReviewSummaries: true,
    },
    checks: { ciTriggerEvents: ["pull_request", "pull_request_target"] },
    mergeStatus: { blockingReviewerLogins: ["copilot"] },
    actions: { autoResolveOutdated: true, autoMarkReady: true, commitSuggestions: true },
  };
}

const DEFAULT_READY_STATE = { isReady: false, shouldCancel: false, remainingSeconds: 600 };

export const NOW = 1_715_800_000;

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const fixturesDir = fileURLToPath(new URL("../../test-cases/", import.meta.url));

export function loadFixture(name: string): Fixture {
  const path = join(fixturesDir, "fixtures", name, "input.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

export function listFixtureNames(): string[] {
  return readdirSync(join(fixturesDir, "fixtures"))
    .filter((d) => !d.startsWith("."))
    .sort();
}

// ---------------------------------------------------------------------------
// Apply fixture mocks
// ---------------------------------------------------------------------------

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof base[k] === "object" &&
      !Array.isArray(base[k]) &&
      base[k] !== null
    ) {
      result[k] = deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export function applyFixture(fixture: Fixture): void {
  const baseCfg = defaultConfig() as unknown as Record<string, unknown>;
  const overlayCfg: Record<string, unknown> = {};
  if (fixture.stallTimeoutMinutes !== undefined) {
    overlayCfg.iterate = { stallTimeoutMinutes: fixture.stallTimeoutMinutes };
  }
  if (fixture.config) {
    Object.assign(overlayCfg, fixture.config);
  }
  const cfg = Object.keys(overlayCfg).length > 0 ? deepMerge(baseCfg, overlayCfg) : baseCfg;
  mockLoadConfig.mockReturnValue(cfg);

  const batchData = fixture.batchData
    ? { ...DEFAULT_BATCH, ...fixture.batchData }
    : { ...DEFAULT_BATCH };
  mockFetchPrBatch.mockResolvedValue({ data: batchData });

  const mergeableFallback = fixture.mergeableFallback ?? {
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
  };
  mockGetMergeableState.mockResolvedValue(mergeableFallback);

  if (fixture.triagedChecks !== undefined) {
    mockTriageFailingChecks.mockResolvedValue(fixture.triagedChecks);
  } else {
    mockTriageFailingChecks.mockImplementation((checks) => Promise.resolve(checks));
  }

  mockFetchStartupFailureChecks.mockResolvedValue(fixture.startupFailureChecks ?? []);
  mockFetchCheckRunAnnotations.mockImplementation((checkRunId) =>
    Promise.resolve(fixture.checkAnnotationsByCheckId?.[checkRunId] ?? []),
  );

  if (fixture.seenMap) {
    mockLoadSeenMap.mockResolvedValue(new Map(Object.entries(fixture.seenMap)));
  } else {
    mockLoadSeenMap.mockResolvedValue(new Map());
  }
  mockMarkSeen.mockResolvedValue(undefined);

  mockAutoResolveOutdated.mockResolvedValue(
    fixture.autoResolveResult ?? { resolved: [], errors: [] },
  );

  mockUpdateReadyDelay.mockResolvedValue(fixture.readyDelayState ?? DEFAULT_READY_STATE);

  mockReadStallState.mockResolvedValue(null);
  mockWriteStallState.mockResolvedValue(undefined);
  mockClearStallState.mockResolvedValue(undefined);

  mockReadFixAttempts.mockResolvedValue(fixture.fixAttempts ?? null);
  mockWriteFixAttempts.mockResolvedValue(undefined);

  if (fixture.cancelRunsFail) {
    mockFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/cancel")) {
        return Promise.resolve({
          ok: false,
          status: 409,
          headers: new Headers(),
          text: () => Promise.resolve("Cannot cancel a workflow run that is completed"),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ data: {} }),
        text: () => Promise.resolve('{"data":{}}'),
      });
    });
  } else {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ data: {} }),
      text: () => Promise.resolve('{"data":{}}'),
    });
  }
}

// ---------------------------------------------------------------------------
// Run capture helpers
// ---------------------------------------------------------------------------

export interface RunResult {
  textOut: string;
  jsonOut: string;
  exitCode: number | undefined;
}

async function runMain(args: string[]): Promise<{ out: string; exitCode: number | undefined }> {
  const chunks: string[] = [];
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((data) => {
    chunks.push(String(data));
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  process.exitCode = undefined;
  try {
    await main(["node", "pr-shepherd", ...args]);
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
  const out = chunks.join("");
  const exitCode = process.exitCode as number | undefined;
  return { out, exitCode };
}

export async function captureRun(fixture: Fixture): Promise<RunResult> {
  const args = ["iterate", "42", ...(fixture.args ?? [])];
  const { out: textOut, exitCode } = await runMain(args);
  const { out: jsonOut } = await runMain([...args, "--format=json"]);
  return { textOut, jsonOut, exitCode };
}

/**
 * Two-tick stall run: tick-1 populates stall state, tick-2 reads it with
 * firstSeenAt far in the past so applyStallGuard escalates.
 */
export async function captureTwoTickStallRun(fixture: Fixture): Promise<RunResult> {
  const args = ["iterate", "42", ...(fixture.args ?? [])];

  // Clear write history so we only inspect calls from this run's tick 1.
  mockWriteStallState.mockClear();

  // Tick 1: readStallState returns null → writeStallState called with real fingerprint
  await runMain(args);
  const writeCalls = mockWriteStallState.mock.calls;
  if (writeCalls.length === 0) {
    throw new Error("two-tick stall: writeStallState was not called during tick 1");
  }
  const { fingerprint } = writeCalls[writeCalls.length - 1][1];

  // Tick 2: readStallState returns old state so escalation fires
  mockReadStallState.mockResolvedValue({ fingerprint, firstSeenAt: NOW - 9999 });
  const { out: textOut, exitCode } = await runMain(args);
  mockReadStallState.mockResolvedValue({ fingerprint, firstSeenAt: NOW - 9999 });
  const { out: jsonOut } = await runMain([...args, "--format=json"]);

  return { textOut, jsonOut, exitCode };
}

// ---------------------------------------------------------------------------
// beforeEach / afterEach registration
// ---------------------------------------------------------------------------

export function registerHarnessBefore(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    process.env.GH_TOKEN = "test-token";
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    mockExecFile.mockImplementation((cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") {
        return Promise.resolve({ stdout: "abc123\n", stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ data: {} }),
      text: () => Promise.resolve('{"data":{}}'),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.GH_TOKEN;
    process.exitCode = undefined;
  });
}
