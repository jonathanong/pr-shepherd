import { describe, expect, it, vi } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — compatibility keys", () => {
  it("ignores removed action keys and warns", async () => {
    writeRc(
      "actions:\n  autoResolveOutdated: false\n  commitSuggestions: false\n  autoMarkReady: false\n",
    );
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const config = await freshLoadConfig();
    const result = config();

    expect(result.actions).not.toHaveProperty("autoResolveOutdated");
    expect(result.actions).not.toHaveProperty("commitSuggestions");
    expect(result.actions.autoMarkReady).toBe(false);
    expect(stderr.mock.calls.map((call) => call[0]).join("")).toContain(
      "actions.autoResolveOutdated is deprecated and ignored",
    );
    expect(stderr.mock.calls.map((call) => call[0]).join("")).toContain(
      "actions.commitSuggestions is deprecated and ignored",
    );
  });

  it("normalizes minimizeComments users to none with a warning", async () => {
    writeRc("iterate:\n  minimizeComments: users\n");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const config = await freshLoadConfig();

    expect(config().iterate.minimizeComments).toBe("none");
    expect(stderr.mock.calls.map((call) => call[0]).join("")).toContain(
      'iterate.minimizeComments: "users" is deprecated',
    );
  });

  it("warns for unknown keys while preserving classify", async () => {
    writeRc("classify:\n  custom: true\nunknownSetting: true\nactions:\n  unknownAction: true\n");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const config = await freshLoadConfig();
    const result = config();

    expect(result.classify).toEqual({ custom: true });
    expect(stderr.mock.calls.map((call) => call[0]).join("")).toContain(
      'unknown key "unknownSetting" ignored',
    );
    expect(stderr.mock.calls.map((call) => call[0]).join("")).not.toContain("classify");
    expect(result.actions).not.toHaveProperty("unknownAction");
    expect(stderr.mock.calls.map((call) => call[0]).join("")).toContain(
      'unknown key "actions.unknownAction" ignored',
    );
  });
});
