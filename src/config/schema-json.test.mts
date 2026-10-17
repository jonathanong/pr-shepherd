import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { resolveConfig } from "./resolve.mts";
import { z } from "zod";
import { configSchema } from "./schema.mts";

const ROOT = join(import.meta.dirname, "..", "..");
const SCHEMA_FILE = join(ROOT, "pr-shepherd.schema.json");

/** The JSON Schema shipped as `pr-shepherd.schema.json` for editor autocompletion. */
function configJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(configSchema, { io: "input", target: "draft-2020-12" }),
    title: "pr-shepherd configuration",
  };
}

describe("pr-shepherd.schema.json", () => {
  it("matches the zod config schema (regenerate with UPDATE_CONFIG_SCHEMA=1)", () => {
    const expected = `${JSON.stringify(configJsonSchema(), null, 2)}\n`;
    if (process.env["UPDATE_CONFIG_SCHEMA"] === "1") writeFileSync(SCHEMA_FILE, expected);
    expect(readFileSync(SCHEMA_FILE, "utf8")).toBe(expected);
  });

  it("rejects unknown keys and declares kebab-case sections", () => {
    const schema = configJsonSchema();
    expect(schema).toMatchObject({
      additionalProperties: false,
      title: "pr-shepherd configuration",
    });
    expect(Object.keys(schema["properties"] as object)).toContain("mark-ready");
  });
});

describe("shipped config examples", () => {
  it("validates the repository's own .pr-shepherdrc.yml", () => {
    const raw = parse(readFileSync(join(ROOT, ".pr-shepherdrc.yml"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(() => resolveConfig(raw, ".pr-shepherdrc.yml")).not.toThrow();
  });

  it("validates every YAML example in docs/configuration.md", () => {
    const doc = readFileSync(join(ROOT, "docs", "configuration.md"), "utf8");
    const blocks = [...doc.matchAll(/```ya?ml\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
    expect(blocks.length).toBeGreaterThan(5);
    for (const block of blocks) {
      const raw = (parse(block) ?? {}) as Record<string, unknown>;
      expect(() => resolveConfig(raw, "docs/configuration.md")).not.toThrow();
    }
  });
});
