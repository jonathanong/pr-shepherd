import { describe, expect, it, vi } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — removed and unknown keys", () => {
  it("rejects the removed minimizeComments users value", async () => {
    writeRc("iterate:\n  minimizeComments: users\n");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const config = await freshLoadConfig();

    expect(config().iterate.minimizeComments).toBe("all");
    expect(stderr.mock.calls.map((call) => call[0]).join("")).toContain(
      'iterate.minimizeComments must be one of "all", "bots", or "none", got "users"',
    );
  });

  it("warns about removed action keys as unknown", async () => {
    writeRc("actions:\n  autoResolveOutdated: false\n  commitSuggestions: false\n");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const config = await freshLoadConfig();
    const result = config();

    expect(result.actions).not.toHaveProperty("autoResolveOutdated");
    expect(stderr.mock.calls.map((call) => call[0]).join("")).toContain(
      'unknown key "actions.autoResolveOutdated" ignored',
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
