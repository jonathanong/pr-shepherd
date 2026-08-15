import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../../", import.meta.url);

describe("published classify types", () => {
  it("keeps the standalone source entry self-contained", () => {
    const pkg = JSON.parse(readFileSync(new URL("package.json", rootUrl), "utf8")) as {
      files: string[];
      exports: Record<string, { types?: string }>;
    };
    const classifyTypes = pkg.exports["./classify"]?.types;

    expect(classifyTypes).toBe("./src/classify/types.mts");
    expect(pkg.files).toContain("src/classify/types.mts");

    const source = readFileSync(new URL(classifyTypes!, rootUrl), "utf8");
    expect(source).not.toMatch(/(?:from\s+|import\s*)["']\.\.?\//);
  });
});
