import { describe, expect, it, vi } from "vitest";
import {
  freshLoadConfig,
  tmpPath,
  writeRc,
  writeRcAt,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — classify.standard", () => {
  it("enables no standard rules by default", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().standardRules).toEqual([]);
  });

  it("enables every rule with all, letting named entries opt out", async () => {
    writeRc("classify:\n  standard:\n    all: true\n    codecov-report: false\n");
    const loadConfig = await freshLoadConfig();
    const rules = loadConfig().standardRules;
    expect(rules).toContain("codex-review-summary");
    expect(rules).not.toContain("codecov-report");
  });

  it("merges the rule map across the rc cascade and keeps other classify keys", async () => {
    writeRc("classify:\n  team: platform\n  standard:\n    codex-notices: true\n");
    writeRcAt("nested", "classify:\n  standard:\n    codecov-report: true\n");
    process.chdir(tmpPath("nested"));
    const loadConfig = await freshLoadConfig();
    const config = loadConfig();
    expect(config.standardRules).toEqual(["codecov-report", "codex-notices"]);
    expect((config.classify as Record<string, unknown>)["team"]).toBe("platform");
  });

  it("warns about unknown names and non-boolean values", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    writeRc("classify:\n  standard:\n    nope: true\n    codex-notices: yes-please\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().standardRules).toEqual([]);
    const output = stderr.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(output).toContain('unknown standard classification rule "classify.standard.nope"');
    expect(output).toContain("classify.standard.codex-notices must be a boolean");
  });

  it("warns about a non-map value", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    writeRc("classify:\n  standard:\n    - codex-notices\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().standardRules).toEqual([]);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join("")).toContain(
      "classify.standard must be a map",
    );
  });
});
