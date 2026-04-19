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
    expect(result.checks.logMaxLines).toBe(50);
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
    writeFileSync(join(tmpDir, RC), "checks:\n  timeoutPatterns:\n    - only-this\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.checks.timeoutPatterns).toEqual(["only-this"]);
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
// applyCompat — removed keys
// ---------------------------------------------------------------------------

describe("loadConfig — removed keys", () => {
  it.each(["baseBranch", "minimizeBots", "cancelCiOnFailure", "autoMinimize"])(
    'strips "%s" and emits a "has been removed" warning',
    async (key) => {
      writeFileSync(join(tmpDir, RC), `${key}: somevalue\n`);
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const loadConfig = await freshLoadConfig();
      const result = loadConfig() as unknown as Record<string, unknown>;
      expect(result[key]).toBeUndefined();
      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain(`"${key}" has been removed`);
    },
  );
});

// ---------------------------------------------------------------------------
// applyCompat — renamed keys
// ---------------------------------------------------------------------------

describe("loadConfig — iterate renames", () => {
  it("maps maxFixAttempts → fixAttemptsPerThread and warns", async () => {
    writeFileSync(join(tmpDir, RC), "iterate:\n  maxFixAttempts: 7\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.fixAttemptsPerThread).toBe(7);
    const raw = result.iterate as unknown as Record<string, unknown>;
    expect(raw["maxFixAttempts"]).toBeUndefined();
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain(
      '"iterate.maxFixAttempts" renamed',
    );
  });
});

describe("loadConfig — watch renames", () => {
  it("maps intervalDefault → interval and warns", async () => {
    writeFileSync(join(tmpDir, RC), "watch:\n  intervalDefault: 2m\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.watch.interval).toBe("2m");
    const raw = result.watch as unknown as Record<string, unknown>;
    expect(raw["intervalDefault"]).toBeUndefined();
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain(
      '"watch.intervalDefault" renamed',
    );
  });

  it("maps readyDelayMinutesDefault → readyDelayMinutes and warns", async () => {
    writeFileSync(join(tmpDir, RC), "watch:\n  readyDelayMinutesDefault: 5\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.watch.readyDelayMinutes).toBe(5);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain(
      '"watch.readyDelayMinutesDefault" renamed',
    );
  });

  it("maps expiresHoursDefault → expiresHours and warns", async () => {
    writeFileSync(join(tmpDir, RC), "watch:\n  expiresHoursDefault: 12\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.watch.expiresHours).toBe(12);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain(
      '"watch.expiresHoursDefault" renamed',
    );
  });
});

describe("loadConfig — resolve renames", () => {
  it("moves shaPollIntervalMs + shaPollMaxAttempts into shaPoll nested object and warns twice", async () => {
    writeFileSync(
      join(tmpDir, RC),
      "resolve:\n  shaPollIntervalMs: 500\n  shaPollMaxAttempts: 3\n",
    );
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.shaPoll.intervalMs).toBe(500);
    expect(result.resolve.shaPoll.maxAttempts).toBe(3);
    const raw = result.resolve as unknown as Record<string, unknown>;
    expect(raw["shaPollIntervalMs"]).toBeUndefined();
    expect(raw["shaPollMaxAttempts"]).toBeUndefined();
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain('"resolve.shaPollIntervalMs" moved');
    expect(output).toContain('"resolve.shaPollMaxAttempts" moved');
  });
});

describe("loadConfig — checks renames", () => {
  it("maps relevantEvents → ciTriggerEvents and warns", async () => {
    writeFileSync(join(tmpDir, RC), "checks:\n  relevantEvents:\n    - push\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.checks.ciTriggerEvents).toEqual(["push"]);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain(
      '"checks.relevantEvents" renamed',
    );
  });

  it("maps logLinesKept → logMaxLines and warns", async () => {
    writeFileSync(join(tmpDir, RC), "checks:\n  logLinesKept: 100\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.checks.logMaxLines).toBe(100);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain(
      '"checks.logLinesKept" renamed',
    );
  });

  it("maps logExcerptMaxChars → logMaxChars and warns", async () => {
    writeFileSync(join(tmpDir, RC), "checks:\n  logExcerptMaxChars: 9999\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.checks.logMaxChars).toBe(9999);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain(
      '"checks.logExcerptMaxChars" renamed',
    );
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
