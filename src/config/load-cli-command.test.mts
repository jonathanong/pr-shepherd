import { describe, expect, it } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — cli-command", () => {
  it("defaults to the bare pr-shepherd binary", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig()["cli-command"]).toEqual(["pr-shepherd"]);
  });

  it("prefixes every emitted command with the configured launcher", async () => {
    writeRc("cli-command:\n  - pnpm\n  - exec\n  - pr-shepherd\n");
    const loadConfig = await freshLoadConfig();
    const { buildPrShepherdCommand } = await import("../cli/runner.mts");

    expect(loadConfig()["cli-command"]).toEqual(["pnpm", "exec", "pr-shepherd"]);
    expect(buildPrShepherdCommand(["42"])).toEqual({
      argv: ["pnpm", "exec", "pr-shepherd", "42"],
      text: "pnpm exec pr-shepherd 42",
    });
    expect(buildPrShepherdCommand(["apply", "journal", "42"]).text).toBe(
      "pnpm exec pr-shepherd apply journal 42",
    );
  });

  it("quotes launcher arguments that need shell quoting", async () => {
    writeRc("cli-command:\n  - npx\n  - --package\n  - pr-shepherd@latest dist\n");
    await freshLoadConfig();
    const { buildPrShepherdCommand } = await import("../cli/runner.mts");

    expect(buildPrShepherdCommand(["42"]).text).toBe('npx --package "pr-shepherd@latest dist" 42');
  });

  it.each([
    ["an empty list", "cli-command: []"],
    ["a string", "cli-command: pnpm exec pr-shepherd"],
    ["a blank argument", "cli-command:\n  - pnpm\n  - ' '"],
    ["a non-string argument", "cli-command:\n  - pnpm\n  - 3"],
  ])("rejects %s", async (_label, yaml) => {
    writeRc(`${yaml}\n`);
    await expectConfigError("`cli-command");
  });
});
