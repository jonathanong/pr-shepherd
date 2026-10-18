import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { resolveConfig } from "./resolve.mts";
import { z } from "zod";
import { configFileSchema, configSchema } from "./schema.mts";

const ROOT = join(import.meta.dirname, "..", "..");
const SCHEMA_FILE = join(ROOT, "pr-shepherd.schema.json");

/** The JSON Schema shipped as `pr-shepherd.schema.json` for editor autocompletion. */
function configJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(configFileSchema, { io: "input", target: "draft-2020-12" }),
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

  it("states the runtime's blank launcher and Shepherd-owned merge-arg checks", () => {
    const { properties } = configJsonSchema() as {
      properties: {
        "cli-command": { items: { pattern: string } };
        merge: { properties: { "command-args": { items: { not: { pattern: string } } } } };
      };
    };
    const nonBlank = new RegExp(properties["cli-command"].items.pattern);
    expect(["npx", " x "].every((arg) => nonBlank.test(arg))).toBe(true);
    expect(["", "  "].some((arg) => nonBlank.test(arg))).toBe(false);

    const owned = new RegExp(properties.merge.properties["command-args"].items.not.pattern);
    const accepted = (arg: string) =>
      configSchema.shape.merge.safeParse({ "command-args": [arg] }).success;
    for (const arg of ["--repo", "--repo=o/r", "-Ro/r", "--admin", "-h", "--autofoo", "--squash"]) {
      expect(owned.test(arg)).toBe(!accepted(arg));
    }
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
