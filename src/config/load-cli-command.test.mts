import { describe, expect, it, vi } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — cliCommand", () => {
  it("defaults to the bare pr-shepherd binary", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().cliCommand).toEqual(["pr-shepherd"]);
  });

  it("prefixes every emitted command with the configured launcher", async () => {
    writeRc("cliCommand:\n  - pnpm\n  - exec\n  - pr-shepherd\n");
    const loadConfig = await freshLoadConfig();
    const { buildPrShepherdCommand } = await import("../cli/runner.mts");
    const { buildShepherdJournalInstruction } = await import("../commands/shepherd-journal.mts");

    expect(loadConfig().cliCommand).toEqual(["pnpm", "exec", "pr-shepherd"]);
    expect(buildPrShepherdCommand(["42"])).toEqual({
      argv: ["pnpm", "exec", "pr-shepherd", "42"],
      text: "pnpm exec pr-shepherd 42",
    });
    expect(buildShepherdJournalInstruction(42)).toContain(
      "`pnpm exec pr-shepherd apply journal 42 '- <decision>'`",
    );
  });

  it("quotes launcher arguments that need shell quoting", async () => {
    writeRc("cliCommand:\n  - npx\n  - --package\n  - pr-shepherd@latest dist\n");
    await freshLoadConfig();
    const { buildPrShepherdCommand } = await import("../cli/runner.mts");

    expect(buildPrShepherdCommand(["42"]).text).toBe('npx --package "pr-shepherd@latest dist" 42');
  });

  it.each([
    ["an empty list", "cliCommand: []"],
    ["a string", "cliCommand: pnpm exec pr-shepherd"],
    ["a blank argument", "cliCommand:\n  - pnpm\n  - ' '"],
    ["a non-string argument", "cliCommand:\n  - pnpm\n  - 3"],
  ])("falls back to defaults for %s", async (_label, yaml) => {
    writeRc(`${yaml}\n`);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();

    expect(loadConfig().cliCommand).toEqual(["pr-shepherd"]);
    expect(stderrSpy.mock.calls.map((call) => call[0]).join("")).toContain(
      "Invalid config: cliCommand must be a non-empty array of non-empty strings",
    );
  });
});
