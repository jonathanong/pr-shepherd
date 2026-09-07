import { describe, expect, it, vi } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

const DEFAULT_POLL = {
  intervalSeconds: 60,
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
});
