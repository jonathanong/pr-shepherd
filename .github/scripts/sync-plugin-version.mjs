import { execFileSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const pluginPaths = [".claude-plugin/plugin.json", "plugins/pr-shepherd/.codex-plugin/plugin.json"];
const mcpPaths = ["plugins/pr-shepherd/.mcp.json", "plugins/pr-shepherd/.codex.mcp.json"];

for (const pluginPath of pluginPaths) {
  const plugin = JSON.parse(readFileSync(pluginPath, "utf8"));
  plugin.version = version;
  writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + "\n");
}

for (const mcpPath of mcpPaths) {
  const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
  const server = mcp.mcpServers?.["pr-shepherd"] ?? mcp["pr-shepherd"];
  server.args = ["--yes", "--package", `pr-shepherd@${version}`, "pr-shepherd-mcp"];
  writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(npx, ["oxfmt", ...pluginPaths, ...mcpPaths], { stdio: "inherit" });
