import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDirectoryPlugin, TARGET } from "../.github/scripts/sync-directory-plugin.mjs";

const FIX =
  "Run `node .github/scripts/sync-directory-plugin.mjs` to regenerate plugins/directory/.";

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe("plugins/directory (Claude plugin directory build)", () => {
  const expected = buildDirectoryPlugin() as Map<string, string | Buffer>;
  const committed = listFiles(TARGET).map((file) => relative(TARGET, file).split("\\").join("/"));

  it("holds exactly the generated files", () => {
    expect(committed.sort(), FIX).toEqual([...expected.keys()].sort());
  });

  it("matches the generated contents", () => {
    for (const [path, contents] of expected) {
      const actual = readFileSync(join(TARGET, path));
      if (path.endsWith(".json")) {
        // oxfmt reflows JSON after generation; compare values.
        expect(JSON.parse(actual.toString("utf8")), `${path}: ${FIX}`).toEqual(
          JSON.parse(contents.toString()),
        );
      } else {
        expect(actual.equals(Buffer.from(contents)), `${path}: ${FIX}`).toBe(true);
      }
    }
  });

  it("ships only what the directory accepts from unverified organizations", () => {
    for (const path of expected.keys()) {
      expect(path).toMatch(/\.(md|json|png)$|^LICENSE$/);
    }
    const manifest = JSON.parse(expected.get(".claude-plugin/plugin.json")!.toString());
    expect(manifest).not.toHaveProperty("hooks");
    expect(manifest).not.toHaveProperty("mcpServers");
    expect(manifest).not.toHaveProperty("userConfig");
    for (const [path, contents] of expected) {
      if (path.endsWith(".md")) expect(contents.toString(), path).not.toMatch(/^allowed-tools:/m);
    }
  });
});
