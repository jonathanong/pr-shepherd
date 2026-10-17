import { describe, expect, it } from "vitest";
import {
  expectConfigError,
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
    expect(rules).toContain("codex-notices");
    expect(rules).not.toContain("codecov-report");
    expect(rules).not.toContain("codex-review-summary");
    expect(rules).not.toContain("coderabbit-review-summary");
  });

  it("merges the rule map across the rc cascade", async () => {
    writeRc("classify:\n  standard:\n    codex-notices: true\n");
    writeRcAt("nested", "classify:\n  standard:\n    codecov-report: true\n");
    process.chdir(tmpPath("nested"));
    const loadConfig = await freshLoadConfig();
    const config = loadConfig();
    expect(config.standardRules).toEqual(["codecov-report", "codex-notices"]);
  });

  it("rejects unknown names and non-boolean values", async () => {
    writeRc("classify:\n  standard:\n    nope: true\n    codex-notices: yes-please\n");
    await expectConfigError("`classify.standard", "nope", "`classify.standard.codex-notices`");
  });

  it("rejects a non-map value", async () => {
    writeRc("classify:\n  standard:\n    - codex-notices\n");
    await expectConfigError("`classify.standard`");
  });
});
