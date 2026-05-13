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
    expect(result.resolve.shaPoll.maxAttempts).toBe(10);
    expect(result.iterate.fixAttemptsPerThread).toBe(3);
    expect(result.checks.ciTriggerEvents).toEqual(["pull_request", "pull_request_target"]);
  });

  it("defaults iterate.minimizeApprovals to false", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeApprovals).toBe(false);
  });

  it("defaults iterate.minimizeComments to all", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeComments).toBe("all");
  });

  it("defaults cli.runner to auto", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.cli?.runner).toBe("auto");
  });

  it("overrides cli.runner when set in rc file", async () => {
    writeFileSync(join(tmpDir, RC), "cli:\n  runner: pnpm\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.cli?.runner).toBe("pnpm");
  });

  it("overrides iterate.minimizeApprovals when set in rc file", async () => {
    writeFileSync(join(tmpDir, RC), "iterate:\n  minimizeApprovals: true\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeApprovals).toBe(true);
  });

  it("overrides iterate.minimizeComments when set in rc file", async () => {
    writeFileSync(join(tmpDir, RC), "iterate:\n  minimizeComments: bots\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeComments).toBe("bots");
  });

  it("rejects invalid iterate.minimizeComments values and falls back to defaults", async () => {
    writeFileSync(join(tmpDir, RC), "iterate:\n  minimizeComments: sometimes\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeComments).toBe("all");
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("iterate.minimizeComments");
  });

  it("rejects invalid cli config shapes and falls back to defaults", async () => {
    writeFileSync(join(tmpDir, RC), "cli: null\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.cli?.runner).toBe("auto");
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("cli must be a plain object");
  });

  it("returns defaults for empty YAML (yaml.parse returns null)", async () => {
    writeFileSync(join(tmpDir, RC), "");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.shaPoll.maxAttempts).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// deepMerge — partial overrides preserve nested defaults
// ---------------------------------------------------------------------------

describe("loadConfig — deep merge", () => {
  it("overrides a single leaf while keeping sibling defaults", async () => {
    writeFileSync(join(tmpDir, RC), "resolve:\n  shaPoll:\n    maxAttempts: 20\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.shaPoll.maxAttempts).toBe(20);
    // sibling leaf must survive the merge
    expect(result.resolve.shaPoll.intervalMs).toBe(2000);
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
    expect(result.resolve.shaPoll.maxAttempts).toBe(10);
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("failed to parse");
  });
});

// ---------------------------------------------------------------------------
// findRcFile directory walk
// ---------------------------------------------------------------------------

describe("loadConfig — findRcFile", () => {
  it("finds rc file in a parent directory when cwd is a nested subdir", async () => {
    writeFileSync(join(tmpDir, RC), "iterate:\n  fixAttemptsPerThread: 50\n");
    const sub = join(tmpDir, "nested", "deep");
    mkdirSync(sub, { recursive: true });
    process.chdir(sub);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.fixAttemptsPerThread).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

describe("loadConfig — caching", () => {
  it("returns the same object reference on repeated calls (no re-parse)", async () => {
    writeFileSync(join(tmpDir, RC), "iterate:\n  fixAttemptsPerThread: 60\n");
    const loadConfig = await freshLoadConfig();
    const first = loadConfig();
    // Delete the file to prove the second call does not re-read disk
    rmSync(join(tmpDir, RC));
    const second = loadConfig();
    expect(second).toBe(first);
  });

  it("_resetConfigCache allows fresh load after cache is cleared", async () => {
    writeFileSync(join(tmpDir, RC), "iterate:\n  fixAttemptsPerThread: 7\n");
    const mod = await import("./load.mts");
    const first = mod.loadConfig();
    expect(first.iterate.fixAttemptsPerThread).toBe(7);

    // Update the file then reset the cache so the next call re-reads disk
    writeFileSync(join(tmpDir, RC), "iterate:\n  fixAttemptsPerThread: 11\n");
    mod._resetConfigCache();
    const second = mod.loadConfig();
    expect(second.iterate.fixAttemptsPerThread).toBe(11);
  });
});
