import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  freshLoadConfig,
  tmpPath,
  writeRc,
  writeRcAt,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — cascade deep-merge", () => {
  it("merges ancestor rc files, with closer directories overriding leaves", async () => {
    writeRc(
      "iterate:\n  fixAttemptsPerThread: 10\n  stallTimeoutMinutes: 90\nignoreChecks:\n  - Kilo*\n",
    );
    writeRcAt("nested", "iterate:\n  stallTimeoutMinutes: 15\n");
    process.chdir(tmpPath("nested"));

    const loadConfig = await freshLoadConfig();
    const result = loadConfig();

    expect(result.iterate.fixAttemptsPerThread).toBe(10);
    expect(result.iterate.stallTimeoutMinutes).toBe(15);
    expect(result.ignoreChecks).toEqual(["Kilo*"]);
    expect(result.watch.readyDelayMinutes).toBe(10);
  });

  it("lets a closer file replace an ancestor array rather than concatenating", async () => {
    writeRc("ignoreChecks:\n  - Kilo*\n");
    writeRcAt("nested", "ignoreChecks:\n  - Preview*\n");
    process.chdir(tmpPath("nested"));

    const loadConfig = await freshLoadConfig();
    expect(loadConfig().ignoreChecks).toEqual(["Preview*"]);
  });

  it("deep-merges nested objects across three rc files", async () => {
    writeRc("resolve:\n  shaPoll:\n    maxAttempts: 20\n");
    writeRcAt("mid", "resolve:\n  shaPoll:\n    intervalMs: 500\n");
    writeRcAt("mid/leaf", "iterate:\n  minimizeApprovals: true\n");
    process.chdir(tmpPath("mid", "leaf"));

    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.resolve.shaPoll.maxAttempts).toBe(20);
    expect(result.resolve.shaPoll.intervalMs).toBe(500);
    expect(result.iterate.minimizeApprovals).toBe(true);
  });

  it("keeps a valid closer file when an ancestor yaml fails to parse", async () => {
    writeRc(":\ninvalid: [\n");
    writeRcAt("nested", "iterate:\n  fixAttemptsPerThread: 8\n");
    process.chdir(tmpPath("nested"));
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate.fixAttemptsPerThread).toBe(8);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("failed to parse");
  });

  it("loads $HOME/.pr-shepherdrc.yml when cwd is outside the home directory", async () => {
    writeRc("iterate:\n  fixAttemptsPerThread: 50\n");
    const outside = mkdtempSync(join(tmpdir(), "shepherd-outside-home-"));
    try {
      process.chdir(outside);
      const loadConfig = await freshLoadConfig();
      expect(loadConfig().iterate.fixAttemptsPerThread).toBe(50);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
