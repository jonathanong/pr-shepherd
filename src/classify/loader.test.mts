import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverRuleFiles, loadRules, _resetRuleCache } from "./loader.mts";

let tmpDir: string;
let classificationDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "prs-classify-test-"));
  classificationDir = join(tmpDir, ".pr-shepherd", "classification");
  mkdirSync(classificationDir, { recursive: true });
  _resetRuleCache();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("discoverRuleFiles", () => {
  it("returns empty array when no .pr-shepherd/classification dir exists", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "prs-empty-"));
    try {
      expect(discoverRuleFiles(emptyDir)).toEqual([]);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("discovers .mjs and .js files in the classification dir", () => {
    writeFileSync(join(classificationDir, "rule-a.mjs"), "export default () => null;");
    writeFileSync(join(classificationDir, "rule-b.js"), "export default () => null;");
    const files = discoverRuleFiles(tmpDir);
    expect(files).toHaveLength(2);
    expect(files[0]).toContain("rule-a.mjs");
    expect(files[1]).toContain("rule-b.js");
  });

  it("ignores files starting with _ or .", () => {
    writeFileSync(join(classificationDir, "_internal.mjs"), "export default () => null;");
    writeFileSync(join(classificationDir, ".hidden.mjs"), "export default () => null;");
    writeFileSync(join(classificationDir, "visible.mjs"), "export default () => null;");
    const files = discoverRuleFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("visible.mjs");
  });

  it("ignores files with non-JS extensions", () => {
    writeFileSync(join(classificationDir, "rule.md"), "# not a rule");
    writeFileSync(join(classificationDir, "rule.mjs"), "export default () => null;");
    const files = discoverRuleFiles(tmpDir);
    expect(files).toHaveLength(1);
  });

  it("walks up parent directories to find the classification dir", () => {
    const nested = join(tmpDir, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(classificationDir, "rule.mjs"), "export default () => null;");
    const files = discoverRuleFiles(nested);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("rule.mjs");
  });

  it("returns files sorted alphabetically", () => {
    writeFileSync(join(classificationDir, "z-rule.mjs"), "export default () => null;");
    writeFileSync(join(classificationDir, "a-rule.mjs"), "export default () => null;");
    const files = discoverRuleFiles(tmpDir);
    expect(files[0]).toContain("a-rule.mjs");
    expect(files[1]).toContain("z-rule.mjs");
  });
});

describe("loadRules", () => {
  it("returns empty array for empty file list", async () => {
    expect(await loadRules([])).toEqual([]);
  });

  it("loads a valid .mjs rule and returns it", async () => {
    const file = join(classificationDir, "suppress-bot.mjs");
    writeFileSync(file, 'export default (item) => item.author === "bot" ? { suppress: true } : null;');
    const rules = await loadRules([file]);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.name).toBe("suppress-bot");
    expect(rules[0]!.rule({ kind: "pr-comment", id: "c1", author: "bot", authorType: "Bot", body: "hi", url: "" })).toEqual({ suppress: true });
    expect(rules[0]!.rule({ kind: "pr-comment", id: "c2", author: "human", authorType: "User", body: "hi", url: "" })).toBeNull();
  });

  it("skips a file whose default export is not a function and writes to stderr", async () => {
    const file = join(classificationDir, "bad-export.mjs");
    writeFileSync(file, "export default { not: 'a function' };");
    const rules = await loadRules([file]);
    expect(rules).toHaveLength(0);
  });

  it("skips a file that throws on load", async () => {
    const file = join(classificationDir, "throw-on-load.mjs");
    writeFileSync(file, "throw new Error('load error');");
    const rules = await loadRules([file]);
    expect(rules).toHaveLength(0);
  });

  it("caches results for the same file list", async () => {
    const file = join(classificationDir, "cached.mjs");
    writeFileSync(file, "export default () => null;");
    const first = await loadRules([file]);
    const second = await loadRules([file]);
    expect(first).toBe(second);
  });

  it("loads .mts files (tsx path)", async () => {
    const file = join(classificationDir, "typed-rule.mts");
    writeFileSync(file, "export default (item: { author: string }) => item.author === 'bot' ? { suppress: true } : null;");
    const rules = await loadRules([file]);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.name).toBe("typed-rule");
  });

  it("does not re-register tsx when already registered", async () => {
    const file = join(classificationDir, "typed-rule.mts");
    writeFileSync(file, "export default () => null;");
    await loadRules([file]);  // sets tsxRegistered = true
    _resetRuleCache();        // clears cache but NOT tsxRegistered
    const rules = await loadRules([file]);  // hits early return in ensureTsxRegistered
    expect(rules).toHaveLength(1);
  });

  it("handles non-Error exceptions during load", async () => {
    const file = join(classificationDir, "throw-string.mjs");
    writeFileSync(file, "throw 'not an error object';");
    const rules = await loadRules([file]);
    expect(rules).toHaveLength(0);
  });
});
