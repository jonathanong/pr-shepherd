import { describe, it, expect } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — iterate.behind-base-hint", () => {
  it("defaults to empty", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate["behind-base-hint"]).toBe("");
  });

  it("overrides when set in rc file", async () => {
    writeRc('iterate:\n  behind-base-hint: "rebase --force-with-lease"\n');
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate["behind-base-hint"]).toBe("rebase --force-with-lease");
  });
});
