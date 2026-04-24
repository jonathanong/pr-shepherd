import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RC = ".pr-shepherdrc.yml";
let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  origCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), "shepherd-load-test-"));
  vi.stubEnv("HOME", tmpDir);
  vi.stubEnv("USERPROFILE", tmpDir);
  vi.resetModules();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

async function freshLoadConfig() {
  const mod = await import("./load.mts");
  return mod.loadConfig;
}

// ---------------------------------------------------------------------------
// No rc file / empty rc
// ---------------------------------------------------------------------------

describe("loadConfig — no rc file", () => {
  it("returns built-in defaults when no rc file exists in the tree", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.concurrency).toBe(4);
    expect(result.iterate.fixAttemptsPerThread).toBe(3);
    expect(result.checks.ciTriggerEvents).toEqual(["pull_request", "pull_request_target"]);
  });

  it("defaults iterate.minimizeReviewSummaries to {bots:true, humans:true, approvals:false}", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeReviewSummaries).toEqual({
      bots: true,
      humans: true,
      approvals: false,
    });
  });

  it("preserves other iterate.minimizeReviewSummaries defaults when only one key is overridden", async () => {
    writeFileSync(join(tmpDir, RC), "iterate:\n  minimizeReviewSummaries:\n    approvals: true\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeReviewSummaries).toEqual({
      bots: true,
      humans: true,
      approvals: true,
    });
  });

  it("returns defaults for empty YAML (yaml.parse returns null)", async () => {
    writeFileSync(join(tmpDir, RC), "");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.concurrency).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// deepMerge — partial overrides preserve nested defaults
// ---------------------------------------------------------------------------

describe("loadConfig — deep merge", () => {
  it("overrides a single leaf while keeping sibling defaults", async () => {
    writeFileSync(join(tmpDir, RC), "resolve:\n  concurrency: 8\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.concurrency).toBe(8);
    // shaPoll nested object must survive the merge
    expect(result.resolve.shaPoll.intervalMs).toBe(2000);
    expect(result.resolve.shaPoll.maxAttempts).toBe(10);
  });

  it("replaces arrays outright rather than concatenating", async () => {
    writeFileSync(join(tmpDir, RC), "checks:\n  ciTriggerEvents:\n    - push\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.checks.ciTriggerEvents).toEqual(["push"]);
  });
});

// ---------------------------------------------------------------------------
// Malformed YAML
// ---------------------------------------------------------------------------

describe("loadConfig — malformed YAML", () => {
  it("returns defaults and writes a 'failed to parse' stderr warning", async () => {
    writeFileSync(join(tmpDir, RC), ":\ninvalid: [\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.concurrency).toBe(4);
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("failed to parse");
  });
});

// ---------------------------------------------------------------------------
// findRcFile directory walk
// ---------------------------------------------------------------------------

describe("loadConfig — findRcFile", () => {
  it("finds rc file in a parent directory when cwd is a nested subdir", async () => {
    writeFileSync(join(tmpDir, RC), "resolve:\n  concurrency: 12\n");
    const sub = join(tmpDir, "nested", "deep");
    mkdirSync(sub, { recursive: true });
    process.chdir(sub);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.concurrency).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

describe("loadConfig — caching", () => {
  it("returns the same object reference on repeated calls (no re-parse)", async () => {
    writeFileSync(join(tmpDir, RC), "iterate:\n  cooldownSeconds: 60\n");
    const loadConfig = await freshLoadConfig();
    const first = loadConfig();
    // Delete the file to prove the second call does not re-read disk
    rmSync(join(tmpDir, RC));
    const second = loadConfig();
    expect(second).toBe(first);
  });
});
