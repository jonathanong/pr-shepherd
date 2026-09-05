import { describe, expect, it } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — checks.ignoreLogLines", () => {
  it("defaults to an empty array — no built-in noise patterns", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().checks.ignoreLogLines).toEqual([]);
  });

  it("accepts a list of regex source strings", async () => {
    writeRc(
      'checks:\n  ignoreLogLines:\n    - "^\\\\[vitest-teardown\\\\]"\n    - "^Duration\\\\s"\n',
    );
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().checks.ignoreLogLines).toEqual(["^\\[vitest-teardown\\]", "^Duration\\s"]);
  });

  it("falls back to defaults for a non-array value", async () => {
    writeRc("checks:\n  ignoreLogLines: disabled\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().checks.ignoreLogLines).toEqual([]);
  });

  it("falls back to defaults for a non-string entry", async () => {
    writeRc("checks:\n  ignoreLogLines:\n    - 42\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().checks.ignoreLogLines).toEqual([]);
  });

  it("falls back to defaults for an invalid regular expression", async () => {
    writeRc("checks:\n  ignoreLogLines:\n    - '['\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().checks.ignoreLogLines).toEqual([]);
  });
});
