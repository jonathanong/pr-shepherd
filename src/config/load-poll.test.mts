import { describe, expect, it, vi } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

const DEFAULT_POLL = {
  intervalSeconds: 60,
  stackIntervalFactor: 2,
  timeoutSeconds: 270,
  debounceSeconds: 60,
  quietStatus: false,
};

describe("loadConfig — poll defaults", () => {
  it("returns the built-in poll defaults", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll).toEqual(DEFAULT_POLL);
  });

  it("deep-merges configured poll defaults", async () => {
    writeRc("poll:\n  intervalSeconds: 120\n  quietStatus: true\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll).toEqual({
      ...DEFAULT_POLL,
      intervalSeconds: 120,
      quietStatus: true,
    });
  });

  it.each([
    ["poll object", "poll: disabled"],
    ["interval", "poll:\n  intervalSeconds: 0"],
    ["timeout", "poll:\n  timeoutSeconds: -1"],
    ["debounce", "poll:\n  debounceSeconds: -1"],
    ["quiet status", "poll:\n  quietStatus: yes"],
  ])("falls back to defaults for an invalid %s", async (_label, yaml) => {
    writeRc(`${yaml}\n`);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();

    expect(loadConfig().poll).toEqual(DEFAULT_POLL);
    expect(stderrSpy.mock.calls.map((call) => call[0]).join("")).toContain("Invalid config: poll");
  });

  it("allows debounce to be disabled", async () => {
    writeRc("poll:\n  debounceSeconds: 0\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll.debounceSeconds).toBe(0);
  });

  it("keeps the default factor when an rc sets only intervalSeconds", async () => {
    writeRc("poll:\n  intervalSeconds: 90\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll.intervalSeconds).toBe(90);
    expect(loadConfig().poll.stackIntervalFactor).toBe(2);
  });

  it.each([
    ["custom", "3", 3],
    ["fractional", "1.5", 1.5],
    ["minimum", "1", 1],
  ])("accepts a %s stackIntervalFactor", async (_label, yaml, expected) => {
    writeRc(`poll:\n  stackIntervalFactor: ${yaml}\n`);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().poll.stackIntervalFactor).toBe(expected);
  });

  it("rejects a stack interval that exceeds the timer limit", async () => {
    writeRc("poll:\n  intervalSeconds: 60\n  stackIntervalFactor: 40000\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();

    expect(loadConfig().poll).toEqual(DEFAULT_POLL);
    expect(stderrSpy.mock.calls.map((call) => call[0]).join("")).toContain(
      "must be finite and at most 2147483647 milliseconds",
    );
  });

  it.each([
    ["zero", "0"],
    ["negative", "-2"],
    ["non-finite", "!!float .nan"],
    ["infinite", "!!float .inf"],
  ])("rejects a %s stackIntervalFactor", async (_label, yaml) => {
    writeRc(`poll:\n  stackIntervalFactor: ${yaml}\n`);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();

    expect(loadConfig().poll).toEqual(DEFAULT_POLL);
    expect(stderrSpy.mock.calls.map((call) => call[0]).join("")).toContain(
      "Invalid config: poll.stackIntervalFactor must be a finite number greater than or equal to 1",
    );
  });
});
