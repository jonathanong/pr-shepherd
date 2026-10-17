import { describe, expect, it } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — checks.ignore-log-lines", () => {
  it("defaults to an empty array — no built-in noise patterns", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().checks["ignore-log-lines"]).toEqual([]);
  });

  it("accepts a list of regex source strings", async () => {
    writeRc(
      'checks:\n  ignore-log-lines:\n    - "^\\\\[vitest-teardown\\\\]"\n    - "^Duration\\\\s"\n',
    );
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().checks["ignore-log-lines"]).toEqual([
      "^\\[vitest-teardown\\]",
      "^Duration\\s",
    ]);
  });

  it("rejects a non-array value", async () => {
    writeRc("checks:\n  ignore-log-lines: disabled\n");
    await expectConfigError("`checks.ignore-log-lines");
  });

  it("rejects a non-string entry", async () => {
    writeRc("checks:\n  ignore-log-lines:\n    - 42\n");
    await expectConfigError("`checks.ignore-log-lines");
  });

  it("rejects an invalid regular expression", async () => {
    writeRc("checks:\n  ignore-log-lines:\n    - '['\n");
    await expectConfigError("`checks.ignore-log-lines");
  });
});
