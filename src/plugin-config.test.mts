import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../", import.meta.url);

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(path, rootUrl), "utf8")) as Record<string, unknown>;
}

describe("plugin configuration", () => {
  it("ships a square PNG listing icon within directory limits", () => {
    const icon = readFileSync(new URL("plugins/pr-shepherd/.claude-plugin/icon.png", rootUrl));
    const width = icon.readUInt32BE(16);
    const height = icon.readUInt32BE(20);

    expect(icon.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(512);
    expect(width).toBeLessThanOrEqual(2048);
    expect(icon.length).toBeLessThan(2 * 1024 * 1024);
  });

  it("registers no MCP server: the skill drives the CLI", () => {
    const manifests = [
      ".claude-plugin/plugin.json",
      "plugins/pr-shepherd/.claude-plugin/plugin.json",
      "plugins/pr-shepherd/.codex-plugin/plugin.json",
    ];
    for (const path of manifests) expect(readJson(path)).not.toHaveProperty("mcpServers");
    // Claude Code and Grok load a plugin-root .mcp.json even without a manifest entry.
    expect(existsSync(new URL("plugins/pr-shepherd/.mcp.json", rootUrl))).toBe(false);
    expect(readJson("plugins/pr-shepherd/.claude-plugin/plugin.json").skills).toBe("./skills/");
  });

  it("keeps every plugin manifest on the package version", () => {
    const pkg = readJson("package.json") as { version: string };
    expect(readJson(".claude-plugin/plugin.json").version).toBe(pkg.version);
    expect(readJson("plugins/pr-shepherd/.claude-plugin/plugin.json").version).toBe(pkg.version);
    expect(readJson("plugins/pr-shepherd/.codex-plugin/plugin.json").version).toBe(pkg.version);
  });

  it("points the Claude marketplace at the self-contained plugin directory", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json") as {
      plugins: Array<{ name: string; source: unknown }>;
    };

    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: "pr-shepherd", source: "./plugins/pr-shepherd" }),
    ]);
  });

  it("registers a Grok marketplace that points at the plugin directory", () => {
    const marketplace = readJson(".grok-plugin/marketplace.json") as {
      plugins: Array<{ name: string; source: { type: string; path: string } }>;
    };

    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: "pr-shepherd",
        source: { type: "local", path: "./plugins/pr-shepherd" },
      }),
    ]);
  });
});
