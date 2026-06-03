import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RC = ".pr-shepherdrc.yml";
let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  origCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), "shepherd-load-ignore-checks-test-"));
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

describe("loadConfig — ignoreChecks", () => {
  it("defaults ignoreChecks to empty", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.ignoreChecks).toEqual([]);
  });

  it("overrides top-level ignoreChecks when set in rc file", async () => {
    writeFileSync(join(tmpDir, RC), 'ignoreChecks:\n  - "Kilo Code Review"\n  - "Kilo*"\n');
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.ignoreChecks).toEqual(["Kilo Code Review", "Kilo*"]);
  });

  it("rejects invalid ignoreChecks values and falls back to defaults", async () => {
    writeFileSync(join(tmpDir, RC), "ignoreChecks:\n  - Kilo Code Review\n  - false\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.ignoreChecks).toEqual([]);
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("ignoreChecks");
  });
});
