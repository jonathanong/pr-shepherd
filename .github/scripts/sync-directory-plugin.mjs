// Generates plugins/directory/, the build submitted to the Claude plugin directory, from
// plugins/pr-shepherd/. The directory accepts hooks, local MCP servers, lockfiles, and
// allowed-tools beyond Read/Grep/Glob/LS only from Verified organizations, so this build ships
// the skills alone. Edit plugins/pr-shepherd/ and rerun this script; never edit
// plugins/directory/ by hand (test-cases/directory-plugin.test.mts fails on drift).
//
// Usage: node .github/scripts/sync-directory-plugin.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "plugins/pr-shepherd";
export const TARGET = "plugins/directory";

const MANIFEST_FIELDS = [
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
];

// The directory build has no MCP server, so the MCP fallback route and its playbook go, and a
// missing CLI is the user's to install.
const SKILL_EDITS = {
  "skills/pr-shepherd/SKILL.md": [
    [
      '- CLI unavailable but MCP `iterate` exists: read the "MCP fallback" playbook.\n',
      "- `pr-shepherd` not found: ask the user to install it (`npm install -g pr-shepherd`, Node 22.19 or later); do not build a substitute.\n",
    ],
    ["- [MCP fallback](references/mcp-fallback.md)\n", ""],
  ],
};
const DROPPED = new Set(["skills/pr-shepherd/references/mcp-fallback.md"]);

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Removes the `allowed-tools` frontmatter line; the directory only accepts Read/Grep/Glob/LS. */
function stripAllowedTools(text, path) {
  const out = text.replace(/^(---\n[\s\S]*?)^allowed-tools:.*\n([\s\S]*?^---\n)/m, "$1$2");
  if (out === text) throw new Error(`${path}: no allowed-tools frontmatter line to remove`);
  return out;
}

function editSkill(text, path) {
  let out = path.endsWith("/SKILL.md") ? stripAllowedTools(text, path) : text;
  for (const [from, to] of SKILL_EDITS[path] ?? []) {
    if (!out.includes(from)) throw new Error(`${path}: expected text not found: ${from.trim()}`);
    out = out.replace(from, to);
  }
  return out;
}

/** The directory build as a map of path (relative to plugins/directory/) to file contents. */
export function buildDirectoryPlugin(root = ".") {
  const files = new Map();
  const source = join(root, SOURCE);
  const manifest = JSON.parse(readFileSync(join(source, ".claude-plugin/plugin.json"), "utf8"));
  const picked = { displayName: "PR Shepherd" };
  for (const field of MANIFEST_FIELDS) if (field in manifest) picked[field] = manifest[field];
  const { name, displayName, ...rest } = picked;
  files.set(
    ".claude-plugin/plugin.json",
    JSON.stringify({ name, displayName, ...rest }, null, 2) + "\n",
  );
  files.set(".claude-plugin/icon.png", readFileSync(join(source, ".claude-plugin/icon.png")));
  files.set("LICENSE", readFileSync(join(root, "LICENSE"), "utf8"));
  for (const file of listFiles(join(source, "skills"))) {
    const path = relative(source, file).split("\\").join("/");
    if (DROPPED.has(path)) continue;
    files.set(path, editSkill(readFileSync(file, "utf8"), path));
  }
  for (const path of Object.keys(SKILL_EDITS)) {
    if (!files.has(path)) throw new Error(`${path}: missing from ${SOURCE}`);
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = buildDirectoryPlugin();
  rmSync(TARGET, { recursive: true, force: true });
  for (const [path, contents] of files) {
    const out = join(TARGET, path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, contents);
  }
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, ["oxfmt", TARGET], { stdio: "inherit" });
}
