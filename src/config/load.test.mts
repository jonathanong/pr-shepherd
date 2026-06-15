import { describe, it, expect, vi } from "vitest";
import { mkdirSync } from "node:fs";
import {
  freshLoadConfig,
  removeRc,
  tmpPath,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — no rc file", () => {
  it("returns built-in defaults when no rc file exists in the tree", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.shaPoll.maxAttempts).toBe(10);
    expect(result.iterate.fixAttemptsPerThread).toBe(3);
    expect(result.checks.ciTriggerEvents).toEqual(["pull_request", "pull_request_target"]);
    expect(result.botUsernames).toContain("coderabbitai");
    expect(result.botUsernames).toContain("greptile-apps");
    expect(result.ignoreChecks).toEqual([]);
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

  it("defaults actions.autoMinimizeSuppressed to true", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.actions.autoMinimizeSuppressed).toBe(true);
  });

  it("defaults actions.neverCancelRuns to empty", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().actions.neverCancelRuns).toEqual([]);
  });

  it("overrides iterate.minimizeApprovals when set in rc file", async () => {
    writeRc("iterate:\n  minimizeApprovals: true\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeApprovals).toBe(true);
  });

  it("overrides iterate.minimizeComments when set in rc file", async () => {
    writeRc("iterate:\n  minimizeComments: bots\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeComments).toBe("bots");
  });

  it("overrides actions.autoMinimizeSuppressed when set in rc file", async () => {
    writeRc("actions:\n  autoMinimizeSuppressed: false\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.actions.autoMinimizeSuppressed).toBe(false);
  });

  it("overrides actions.neverCancelRuns when set in rc file", async () => {
    writeRc('actions:\n  neverCancelRuns:\n    - "Final Code Review"\n');
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().actions.neverCancelRuns).toEqual(["Final Code Review"]);
  });

  it("overrides top-level botUsernames when set in rc file", async () => {
    writeRc("botUsernames:\n  - custom-reviewer\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.botUsernames).toEqual(["custom-reviewer"]);
  });

  it("overrides top-level ignoreChecks when set in rc file", async () => {
    writeRc('ignoreChecks:\n  - "Kilo Code Review"\n  - "Kilo*"\n');
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().ignoreChecks).toEqual(["Kilo Code Review", "Kilo*"]);
  });

  it("rejects invalid botUsernames values and falls back to defaults", async () => {
    writeRc("botUsernames: custom-reviewer\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.botUsernames).toContain("coderabbitai");
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("botUsernames");
  });

  it("rejects invalid ignoreChecks values and falls back to defaults", async () => {
    writeRc("ignoreChecks:\n  - Kilo Code Review\n  - false\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().ignoreChecks).toEqual([]);
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("ignoreChecks");
  });

  it("rejects invalid actions.neverCancelRuns values and falls back to defaults", async () => {
    writeRc("actions:\n  neverCancelRuns:\n    - Final Code Review\n    - false\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().actions.neverCancelRuns).toEqual([]);
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("actions.neverCancelRuns");
  });

  it("rejects invalid iterate.minimizeComments values and falls back to defaults", async () => {
    writeRc("iterate:\n  minimizeComments: sometimes\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.minimizeComments).toBe("all");
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("iterate.minimizeComments");
  });

  it("returns defaults for empty YAML (yaml.parse returns null)", async () => {
    writeRc("");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.shaPoll.maxAttempts).toBe(10);
  });
});

describe("loadConfig — deep merge", () => {
  it("overrides a single leaf while keeping sibling defaults", async () => {
    writeRc("resolve:\n  shaPoll:\n    maxAttempts: 20\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.shaPoll.maxAttempts).toBe(20);
    // sibling leaf must survive the merge
    expect(result.resolve.shaPoll.intervalMs).toBe(2000);
  });

  it("replaces arrays outright rather than concatenating", async () => {
    writeRc("checks:\n  ciTriggerEvents:\n    - push\n");
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.checks.ciTriggerEvents).toEqual(["push"]);
  });
});

describe("loadConfig — malformed YAML", () => {
  it("returns defaults and writes a 'failed to parse' stderr warning", async () => {
    writeRc(":\ninvalid: [\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.shaPoll.maxAttempts).toBe(10);
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("failed to parse");
  });
});

describe("loadConfig — findRcFile", () => {
  it("finds rc file in a parent directory when cwd is a nested subdir", async () => {
    writeRc("iterate:\n  fixAttemptsPerThread: 50\n");
    const sub = tmpPath("nested", "deep");
    mkdirSync(sub, { recursive: true });
    process.chdir(sub);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.fixAttemptsPerThread).toBe(50);
  });
});

describe("loadConfig — caching", () => {
  it("returns the same object reference on repeated calls (no re-parse)", async () => {
    writeRc("iterate:\n  fixAttemptsPerThread: 60\n");
    const loadConfig = await freshLoadConfig();
    const first = loadConfig();
    // Delete the file to prove the second call does not re-read disk
    removeRc();
    const second = loadConfig();
    expect(second).toBe(first);
  });

  it("_resetConfigCache allows fresh load after cache is cleared", async () => {
    writeRc("iterate:\n  fixAttemptsPerThread: 7\n");
    const mod = await import("./load.mts");
    const first = mod.loadConfig();
    expect(first.iterate.fixAttemptsPerThread).toBe(7);

    // Update the file then reset the cache so the next call re-reads disk
    writeRc("iterate:\n  fixAttemptsPerThread: 11\n");
    mod._resetConfigCache();
    const second = mod.loadConfig();
    expect(second.iterate.fixAttemptsPerThread).toBe(11);
  });
});
