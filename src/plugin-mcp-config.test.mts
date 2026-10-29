import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../", import.meta.url);

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(path, rootUrl), "utf8")) as Record<string, unknown>;
}

describe("plugin MCP configuration", () => {
  it("uses the package version for the bundled stdio server", () => {
    const pkg = readJson("package.json") as { version: string };
    const claudeMcp = readJson("plugins/pr-shepherd/.mcp.json") as Record<
      string,
      { command: string; args: string[] }
    >;
    const codexMcp = readJson("plugins/pr-shepherd/.codex.mcp.json") as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const expected = {
      command: "npx",
      args: ["--yes", "--package", `pr-shepherd@${pkg.version}`, "pr-shepherd-mcp"],
    };

    expect(claudeMcp["pr-shepherd"]).toEqual(expected);
    expect(codexMcp.mcpServers["pr-shepherd"]).toEqual(expected);
  });

  it("locks the launched package in the plugin directory", () => {
    // Not compared with .mcp.json: the release commit bumps that pin before publish,
    // and the lock only follows once the new version is on the registry.
    const manifest = readJson("plugins/pr-shepherd/package.json") as {
      dependencies: Record<string, string>;
    };
    const lock = readJson("plugins/pr-shepherd/package-lock.json") as {
      packages: Record<string, { version?: string; integrity?: string }>;
    };
    const locked = lock.packages["node_modules/pr-shepherd"];

    expect(locked?.version).toBe(manifest.dependencies["pr-shepherd"]);
    expect(locked?.integrity).toMatch(/^sha512-/);
  });

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

  it("registers host-appropriate MCP configs in both plugin manifests", () => {
    const codex = readJson("plugins/pr-shepherd/.codex-plugin/plugin.json");
    const claude = readJson(".claude-plugin/plugin.json");
    const claudeDirectory = readJson("plugins/pr-shepherd/.claude-plugin/plugin.json");

    expect(codex.mcpServers).toBe("./.codex.mcp.json");
    expect(claude.mcpServers).toBe("./plugins/pr-shepherd/.mcp.json");
    expect(claudeDirectory.mcpServers).toBe("./.mcp.json");
    expect(claudeDirectory.skills).toBe("./skills/");
  });

  it("keeps both Claude plugin manifests on the package version", () => {
    const pkg = readJson("package.json") as { version: string };
    expect(readJson(".claude-plugin/plugin.json").version).toBe(pkg.version);
    expect(readJson("plugins/pr-shepherd/.claude-plugin/plugin.json").version).toBe(pkg.version);
  });

  it("points the Claude marketplace at the self-contained plugin directory", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json") as {
      plugins: Array<{ name: string; source: unknown }>;
    };

    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: "pr-shepherd", source: "./plugins/pr-shepherd" }),
    ]);
  });

  it("registers a Grok marketplace that points at the plugin with MCP config", () => {
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
