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
import builtinConfig from "../../src/config.json" with { type: "json" };

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
  autoResolveThreads: vi.fn().mockResolvedValue({ resolved: [], errors: [] }),
  autoMinimizeComments: vi.fn().mockResolvedValue({ minimized: [], errors: [] }),
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
vi.mock("../../src/state/bot-cr-seen.mts", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readBotCrSeenState: vi.fn().mockResolvedValue(null),
    writeBotCrSeenState: vi.fn().mockResolvedValue(undefined),
  };
});

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
import { readBotCrSeenState, writeBotCrSeenState } from "../../src/state/bot-cr-seen.mts";

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
const mockReadBotCrSeenState = vi.mocked(readBotCrSeenState);
const mockWriteBotCrSeenState = vi.mocked(writeBotCrSeenState);

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
  /**
   * Return value of readBotCrSeenState(). Pre-seed bot CR first-seen
   * timestamps to exercise the `bot-cr-not-dismissed` escalate trigger.
   */
  botCrSeen?: {
    reviews: Record<string, { firstSeenAt: number; bodyHash: string }>;
  };
  /** If true, REST cancel calls return HTTP 409. */
  cancelRunsFail?: boolean;
  /** Extra CLI args appended after "42". */
  args?: string[];
  /** Freeform note about the scenario. Not read by the harness; documentation only. */
  description?: string;
  /**
   * Expected process exit code for this tick — see docs/exit-codes.md. Required so every
   * fixture pins the documented 0/10-15 contract, not just its Markdown/JSON body.
   */
  expectedExitCode: number;
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
  viewerAuthorization: {
    repositoryPermission: "ADMIN",
    viewerCanAdminister: true,
    viewerDidAuthor: true,
    viewerCanUpdate: true,
    viewerCanEnableAutoMerge: true,
    viewerCanEditFiles: true,
    headRepositoryPermission: "ADMIN",
  },
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

/**
 * Deep clone of the shipped built-in defaults (src/config.json) — the same object
 * src/config/load.mts falls back to when no .pr-shepherdrc.yml is found. Cloning the real
 * defaults (rather than hand-copying them) means the harness cannot silently drift from
 * production, as it previously did (see test-cases/README.md).
 */
export function defaultConfig() {
  return structuredClone(builtinConfig);
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

function stampAnnotationProbe<T>(checks: T[], annotationCheckIds: Set<string>): T[] {
  if (annotationCheckIds.size === 0) return checks;
  return checks.map((c) => {
    if (c !== null && typeof c === "object" && "id" in c && annotationCheckIds.has(String(c.id))) {
      return { ...c, hasAnnotations: true };
    }
    return c;
  });
}

function stampInitialRunAttempt(checks: unknown[]): unknown[] {
  return checks.map((check) => {
    if (
      check !== null &&
      typeof check === "object" &&
      "runId" in check &&
      check.runId !== null &&
      !("runAttempt" in check)
    ) {
      return { ...check, runAttempt: 1 };
    }
    return check;
  });
}

export function applyFixture(fixture: Fixture): void {
  const baseCfg = defaultConfig() as unknown as Record<string, unknown>;
  let overlayCfg: Record<string, unknown> = {};
  if (fixture.stallTimeoutMinutes !== undefined) {
    overlayCfg.iterate = { stallTimeoutMinutes: fixture.stallTimeoutMinutes };
  }
  if (fixture.config) {
    // deepMerge, not Object.assign: a plain assign would let fixture.config.iterate replace
    // (rather than merge with) the stallTimeoutMinutes shortcut set above, silently dropping it
    // whenever a fixture used both knobs.
    overlayCfg = deepMerge(overlayCfg, fixture.config);
  }
  const cfg = Object.keys(overlayCfg).length > 0 ? deepMerge(baseCfg, overlayCfg) : baseCfg;
  mockLoadConfig.mockReturnValue(cfg);

  const batchData = fixture.batchData
    ? { ...DEFAULT_BATCH, ...fixture.batchData }
    : { ...DEFAULT_BATCH };
  const annotationCheckIds = new Set(Object.keys(fixture.checkAnnotationsByCheckId ?? {}));
  if (Array.isArray(batchData.reviewThreads)) {
    batchData.reviewThreads = batchData.reviewThreads.map((thread) => ({
      viewerCanReply: true,
      viewerCanResolve: true,
      ...thread,
    }));
  }
  if (Array.isArray(batchData.comments)) {
    batchData.comments = batchData.comments.map((comment) => ({
      viewerCanMinimize: true,
      ...comment,
    }));
  }
  for (const key of ["reviewSummaries", "approvedReviews"]) {
    if (Array.isArray(batchData[key])) {
      batchData[key] = batchData[key].map((review) => ({
        viewerCanMinimize: true,
        ...review,
      }));
    }
  }
  if (Array.isArray(batchData.checks)) {
    batchData.checks = stampAnnotationProbe(
      batchData.checks as Array<Record<string, unknown>>,
      annotationCheckIds,
    );
  }
  mockFetchPrBatch.mockResolvedValue({ data: batchData });

  const mergeableFallback = fixture.mergeableFallback ?? {
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
  };
  mockGetMergeableState.mockResolvedValue(mergeableFallback);

  if (fixture.triagedChecks !== undefined) {
    mockTriageFailingChecks.mockResolvedValue(
      stampInitialRunAttempt(stampAnnotationProbe(fixture.triagedChecks, annotationCheckIds)),
    );
  } else {
    mockTriageFailingChecks.mockImplementation((checks) =>
      Promise.resolve(stampInitialRunAttempt(checks)),
    );
  }

  mockFetchStartupFailureChecks.mockResolvedValue(
    stampInitialRunAttempt(fixture.startupFailureChecks ?? []),
  );
  mockFetchCheckRunAnnotations.mockImplementation((checkRunId) =>
    Promise.resolve(fixture.checkAnnotationsByCheckId?.[checkRunId] ?? []),
  );

  if (fixture.seenMap) {
    mockLoadSeenMap.mockResolvedValue(new Map(Object.entries(fixture.seenMap)));
  } else {
    mockLoadSeenMap.mockResolvedValue(new Map());
  }
  mockMarkSeen.mockResolvedValue(undefined);

  mockAutoResolveOutdated.mockResolvedValue({ resolved: [], errors: [] });

  mockUpdateReadyDelay.mockResolvedValue(fixture.readyDelayState ?? DEFAULT_READY_STATE);

  mockReadStallState.mockResolvedValue(null);
  mockWriteStallState.mockResolvedValue(undefined);
  mockClearStallState.mockResolvedValue(undefined);

  mockReadFixAttempts.mockResolvedValue(fixture.fixAttempts ?? null);
  mockWriteFixAttempts.mockResolvedValue(undefined);

  mockReadBotCrSeenState.mockResolvedValue(fixture.botCrSeen ?? null);
  mockWriteBotCrSeenState.mockResolvedValue(undefined);

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
  /** Exit code from the text-format run. */
  exitCode: number | undefined;
  /** Exit code from the --format=json run — must equal `exitCode`; see index.test.mts. */
  jsonExitCode: number | undefined;
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
  const { out: jsonOut, exitCode: jsonExitCode } = await runMain([...args, "--format=json"]);
  return { textOut, jsonOut, exitCode, jsonExitCode };
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
  const { out: jsonOut, exitCode: jsonExitCode } = await runMain([...args, "--format=json"]);

  return { textOut, jsonOut, exitCode, jsonExitCode };
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
