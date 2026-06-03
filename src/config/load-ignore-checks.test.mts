import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  makeTempConfigDir,
  removeTempConfigDir,
  stringListYaml,
  writeRcFile,
} from "../../test-helpers/config/temp-rc.test-support.mts";

let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  origCwd = process.cwd();
  tmpDir = makeTempConfigDir("shepherd-load-ignore-checks-test-");
  vi.stubEnv("HOME", tmpDir);
  vi.stubEnv("USERPROFILE", tmpDir);
  vi.resetModules();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  removeTempConfigDir(tmpDir);
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
    writeRcFile(tmpDir, stringListYaml("ignoreChecks", ["Kilo Code Review", "Kilo*"]));
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.ignoreChecks).toEqual(["Kilo Code Review", "Kilo*"]);
  });

  it("rejects invalid ignoreChecks values and falls back to defaults", async () => {
    writeRcFile(tmpDir, "ignoreChecks:\n  - Kilo Code Review\n  - false\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.ignoreChecks).toEqual([]);
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("ignoreChecks");
  });
});
