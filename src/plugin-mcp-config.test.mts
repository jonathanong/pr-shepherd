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

  it("registers host-appropriate MCP configs in both plugin manifests", () => {
    const codex = readJson("plugins/pr-shepherd/.codex-plugin/plugin.json");
    const claude = readJson(".claude-plugin/plugin.json");

    expect(codex.mcpServers).toBe("./.codex.mcp.json");
    expect(claude.mcpServers).toBe("./plugins/pr-shepherd/.mcp.json");
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
