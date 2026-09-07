import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runWithExecutionCwd } from "../execution-context.mts";
import { resolvePrStatePath } from "./base.mts";
import {
  fingerprintInputDigest,
  loadPrFingerprint,
  storePrFingerprint,
} from "./pr-fingerprint.mts";
import type { PrShepherdConfig } from "../config/load.mts";
import { testFingerprint } from "../../test-helpers/github/fingerprint-fixture.mts";
import type { ShepherdReport } from "../types.mts";

const key = { owner: "owner", repo: "repo", pr: 42 };
const report = { pr: 42, status: "IN_PROGRESS", repo: "owner/repo" } as ShepherdReport;
const config = {
  botUsernames: [],
  ignoreChecks: [],
  iterate: {
    fixAttemptsPerThread: 3,
    stallTimeoutMinutes: 60,
    minimizeApprovals: false,
    minimizeComments: "all",
    behindBaseHint: "",
    resolveOtherHumanThreads: "none",
  },
  watch: { readyDelayMinutes: 10, graphqlQuotaWarnings: [] },
  resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 } },
  checks: { ciTriggerEvents: ["pull_request"], ignoreLogLines: [] },
  mergeStatus: { blockingReviewerLogins: [] },
  actions: {
    autoMinimizeSuppressed: true,
    autoMarkReady: true,
    neverCancelRuns: [],
    workWhileQueued: false,
  },
} as PrShepherdConfig;

let testStateDir: string;

beforeEach(async () => {
  testStateDir = `${process.env["TMPDIR"] ?? "/var/tmp"}/shepherd-fp-test-${randomBytes(4).toString("hex")}`;
  await mkdir(testStateDir, { recursive: true });
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

describe("pr-fingerprint state", () => {
  it("returns null when no file exists", async () => {
    expect(await loadPrFingerprint(key)).toBeNull();
  });

  it("round-trips a stored fingerprint and report", async () => {
    const fingerprint = testFingerprint({ headRefOid: "deadbeef" });
    await storePrFingerprint(key, fingerprint, report, config);
    await expect(loadPrFingerprint(key)).resolves.toEqual({
      version: 3,
      inputDigest: fingerprintInputDigest(config),
      fingerprint,
      report,
    });
  });

  it("swallows fingerprint write failures", async () => {
    const blocker = `${testStateDir}-file`;
    await writeFile(blocker, "not-a-directory", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
    await expect(
      storePrFingerprint(key, testFingerprint(), report, config),
    ).resolves.toBeUndefined();
    await rm(blocker, { force: true });
  });

  it("swallows tmp cleanup failures after a failed write", async () => {
    await storePrFingerprint(key, testFingerprint(), report, config);
    const dir = dirname(resolvePrStatePath(key, "fingerprint.json"));
    await chmod(dir, 0o555);
    await expect(
      storePrFingerprint(key, testFingerprint(), report, config),
    ).resolves.toBeUndefined();
    await chmod(dir, 0o755);
  });

  it("changes digest when report-shaping config changes", () => {
    const other = {
      ...config,
      checks: { ...config.checks, ciTriggerEvents: ["push"] },
      actions: { ...config.actions, neverCancelRuns: ["lint"] },
      mergeStatus: { blockingReviewerLogins: ["coderabbit"] },
    } as PrShepherdConfig;
    expect(fingerprintInputDigest(other)).not.toBe(fingerprintInputDigest(config));
  });

  it("changes digest when classification rule file contents change", async () => {
    const rulesDir = join(testStateDir, ".pr-shepherd", "classification");
    await mkdir(rulesDir, { recursive: true });
    const rulePath = join(rulesDir, "example.mjs");
    await writeFile(rulePath, "export default () => ({ skip: true });\n", "utf8");
    const before = runWithExecutionCwd(testStateDir, () => fingerprintInputDigest(config));
    await writeFile(rulePath, "export default () => ({ skip: false });\n", "utf8");
    const after = runWithExecutionCwd(testStateDir, () => fingerprintInputDigest(config));
    expect(after).not.toBe(before);
  });

  it("treats unreadable classification rule files as digest input", async () => {
    const rulesDir = join(testStateDir, ".pr-shepherd", "classification");
    await mkdir(rulesDir, { recursive: true });
    await symlink("/no-such-pr-shepherd-rule", join(rulesDir, "gone.mjs"));
    expect(runWithExecutionCwd(testStateDir, () => fingerprintInputDigest(config))).toEqual(
      expect.any(String),
    );
  });

  it("returns null for invalid JSON or a mismatched version", async () => {
    const path = resolvePrStatePath(key, "fingerprint.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{not-json", "utf8");
    expect(await loadPrFingerprint(key)).toBeNull();
    await writeFile(path, JSON.stringify({ version: 99, fingerprint: {}, report: {} }), "utf8");
    expect(await loadPrFingerprint(key)).toBeNull();
  });
});
