import { describe, it, expect } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — iterate.behindBaseHint", () => {
  it("defaults to empty", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.behindBaseHint).toBe("");
  });

  it("overrides when set in rc file", async () => {
    writeRc('iterate:\n  behindBaseHint: "rebase --force-with-lease"\n');
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate.behindBaseHint).toBe("rebase --force-with-lease");
  });
});
