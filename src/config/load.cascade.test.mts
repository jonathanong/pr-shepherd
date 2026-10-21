import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  tmpPath,
  writeRc,
  writeRcAt,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — cascade deep-merge", () => {
  it("merges ancestor rc files, with closer directories overriding leaves", async () => {
    writeRc(
      "iterate:\n  triage-attempts-per-thread: 10\n  stall-timeout-minutes: 90\nchecks:\n  ignore:\n    - Kilo*\n",
    );
    writeRcAt("nested", "iterate:\n  stall-timeout-minutes: 15\n");
    process.chdir(tmpPath("nested"));

    const loadConfig = await freshLoadConfig();
    const result = loadConfig();

    expect(result.iterate["triage-attempts-per-thread"]).toBe(10);
    expect(result.iterate["stall-timeout-minutes"]).toBe(15);
    expect(result.checks.ignore).toEqual(["Kilo*"]);
    expect(result.iterate["ready-delay-minutes"]).toBe(0);
  });

  it("lets a closer file replace an ancestor array rather than concatenating", async () => {
    writeRc("checks:\n  ignore:\n    - Kilo*\n");
    writeRcAt("nested", "checks:\n  ignore:\n    - Preview*\n");
    process.chdir(tmpPath("nested"));

    const loadConfig = await freshLoadConfig();
    expect(loadConfig().checks.ignore).toEqual(["Preview*"]);
  });

  it("deep-merges nested objects across three rc files", async () => {
    writeRc("apply:\n  sha-poll-max-attempts: 20\n");
    writeRcAt("mid", "apply:\n  sha-poll-interval-seconds: 0.5\n");
    writeRcAt("mid/leaf", "iterate:\n  minimize-approvals: true\n");
    process.chdir(tmpPath("mid", "leaf"));

    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.apply["sha-poll-max-attempts"]).toBe(20);
    expect(result.apply["sha-poll-interval-seconds"]).toBe(0.5);
    expect(result.iterate["minimize-approvals"]).toBe(true);
  });

  it("rejects an invalid ancestor file even when a closer file is valid", async () => {
    writeRc(":\ninvalid: [\n");
    writeRcAt("nested", "iterate:\n  triage-attempts-per-thread: 8\n");
    process.chdir(tmpPath("nested"));
    await expectConfigError(`invalid config in ${tmpPath(".pr-shepherdrc.yml")}`);
  });

  it("names the closest file when it holds the invalid key", async () => {
    writeRc("iterate:\n  triage-attempts-per-thread: 8\n");
    writeRcAt("nested", "iterate:\n  stall-timeout-minutes: -1\n");
    process.chdir(tmpPath("nested"));
    await expectConfigError(
      `invalid config in ${tmpPath("nested", ".pr-shepherdrc.yml")}`,
      "`iterate.stall-timeout-minutes`",
    );
  });

  it("loads $HOME/.pr-shepherdrc.yml when cwd is outside the home directory", async () => {
    writeRc("iterate:\n  triage-attempts-per-thread: 50\n");
    const outside = mkdtempSync(join(tmpdir(), "shepherd-outside-home-"));
    try {
      process.chdir(outside);
      const loadConfig = await freshLoadConfig();
      expect(loadConfig().iterate["triage-attempts-per-thread"]).toBe(50);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("lets an outside-home project rc override $HOME while keeping sibling home keys", async () => {
    writeRc("iterate:\n  triage-attempts-per-thread: 50\n  stall-timeout-minutes: 90\n");
    const outside = mkdtempSync(join(tmpdir(), "shepherd-outside-home-"));
    try {
      writeFileSync(
        join(outside, ".pr-shepherdrc.yml"),
        "version: 1\niterate:\n  stall-timeout-minutes: 15\n",
      );
      process.chdir(outside);
      const loadConfig = await freshLoadConfig();
      const result = loadConfig();
      expect(result.iterate["triage-attempts-per-thread"]).toBe(50);
      expect(result.iterate["stall-timeout-minutes"]).toBe(15);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
