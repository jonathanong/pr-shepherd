import { describe, expect, it } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

const DEFAULT_POLL = {
  "interval-seconds": 60,
  "stack-interval-factor": 2,
  "timeout-seconds": 270,
  "debounce-seconds": 60,
  "quiet-status": false,
  "reconcile-seconds": 900,
  "quota-warnings": [
    { "remaining-percent": 30, "interval-factor": 2 },
    { "remaining-percent": 20, "interval-factor": 5 },
    { "remaining-percent": 10, "interval-factor": 10 },
  ],
};

describe("loadConfig — poll defaults", () => {
  it("returns the built-in poll defaults", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll).toEqual(DEFAULT_POLL);
  });

  it("deep-merges configured poll defaults", async () => {
    writeRc("poll:\n  interval-seconds: 120\n  quiet-status: true\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll).toEqual({
      ...DEFAULT_POLL,
      "interval-seconds": 120,
      "quiet-status": true,
    });
  });

  it.each([
    ["poll object", "poll: disabled"],
    ["interval", "poll:\n  interval-seconds: 0"],
    ["timeout", "poll:\n  timeout-seconds: -1"],
    ["debounce", "poll:\n  debounce-seconds: -1"],
    ["reconcile", "poll:\n  reconcile-seconds: -1"],
    ["quiet status", "poll:\n  quiet-status: yes"],
  ])("rejects an invalid %s", async (_label, yaml) => {
    writeRc(`${yaml}\n`);
    await expectConfigError("`poll");
  });

  it("allows debounce to be disabled", async () => {
    writeRc("poll:\n  debounce-seconds: 0\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll["debounce-seconds"]).toBe(0);
  });

  it("keeps the default factor when an rc sets only interval-seconds", async () => {
    writeRc("poll:\n  interval-seconds: 90\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll["interval-seconds"]).toBe(90);
    expect(loadConfig().poll["stack-interval-factor"]).toBe(2);
  });

  it.each([
    ["custom", "3", 3],
    ["fractional", "1.5", 1.5],
    ["minimum", "1", 1],
  ])("accepts a %s stack-interval-factor", async (_label, yaml, expected) => {
    writeRc(`poll:\n  stack-interval-factor: ${yaml}\n`);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll["stack-interval-factor"]).toBe(expected);
  });

  it("rejects a stack interval that exceeds the timer limit", async () => {
    writeRc("poll:\n  interval-seconds: 60\n  stack-interval-factor: 40000\n");
    await expectConfigError(
      "`poll.interval-seconds` × `poll.stack-interval-factor` must be at most 2147483.647 seconds",
    );
  });

  it.each([
    ["zero", "0"],
    ["negative", "-2"],
    ["non-finite", "!!float .nan"],
    ["infinite", "!!float .inf"],
  ])("rejects a %s stack-interval-factor", async (_label, yaml) => {
    writeRc(`poll:\n  stack-interval-factor: ${yaml}\n`);
    await expectConfigError("`poll.stack-interval-factor`");
  });
});
