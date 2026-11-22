// Invariants over a generated outcome-suite directory (see generate.mjs). They
// keep the baseline arm free of Shepherd: plugin eval serves a mock dir only in
// the with arm when it matches a plugin-declared MCP server, so the plugin copy's
// `mcpServers` must be exactly the non-baseline mock dirs. Returns problems
// instead of throwing so the test can assert on them.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CHECKS_RULE_START } from "./write.mjs";

const BASELINE_SERVERS = ["gh", "github"];
// Shepherd vocabulary a baseline-visible file must not carry.
export const LEAK = /shepherd|pr-shepherd|nextCheck|Playbook|--until-terminal/i;

const files = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .sort();
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const dirs = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()) : [];

/** Mock dirs other than gh/github, over every case. Also flags a dir no plugin declares. */
export function checkServers(outDir, casesDir) {
  const problems = [];
  const manifest = JSON.parse(readFileSync(join(outDir, ".claude-plugin", "plugin.json"), "utf8"));
  const declared = Object.keys(manifest.mcpServers ?? {}).sort();
  const shipped = new Set();
  for (const slug of dirs(casesDir)) {
    for (const server of dirs(join(casesDir, slug, "mocks"))) {
      if (BASELINE_SERVERS.includes(server)) continue;
      shipped.add(server);
      if (!declared.includes(server))
        problems.push(`${slug}: mocks/${server} is not a declared plugin server`);
    }
  }
  if ([...shipped].sort().join() !== declared.join()) {
    problems.push(
      `plugin mcpServers [${declared}] != non-baseline mock dirs [${[...shipped].sort()}]`,
    );
  }
  return problems;
}

/** The copied skills must be the source skills, byte for byte. */
export function checkSkills(outDir, pluginDir) {
  const src = join(pluginDir, "skills");
  const dst = join(outDir, "skills");
  const rel = (root) => files(root).map((f) => relative(root, f));
  const a = rel(src);
  const b = existsSync(dst) ? rel(dst) : [];
  if (a.join("\n") !== b.join("\n"))
    return ["skills copy has a different file list than the source"];
  return a
    .filter((f) => sha(join(src, f)) !== sha(join(dst, f)))
    .map((f) => `skills/${f} differs from source`);
}

/** Shepherd vocabulary in anything the baseline arm sees. */
export function checkLeaks(casesDir) {
  const problems = [];
  for (const slug of dirs(casesDir)) {
    const root = join(casesDir, slug);
    const visible = files(root)
      .map((f) => relative(root, f))
      .filter(
        (f) =>
          f === "prompt.md" ||
          (f.startsWith("graders/") && f !== "graders/skill-fired.md") ||
          f.startsWith("mocks/gh/") ||
          f.startsWith("mocks/github/"),
      );
    for (const f of visible) {
      const hit = readFileSync(join(root, f), "utf8").match(LEAK);
      if (hit) problems.push(`${slug}/${f}: baseline-visible "${hit[0]}"`);
    }
  }
  return problems;
}

/** Both GitHub mocks of every case carry the rule that makes them report the same checks. */
export function checkChecksRule(casesDir) {
  const problems = [];
  for (const slug of dirs(casesDir)) {
    for (const f of [join("mocks", "gh", "gh.md"), join("mocks", "github", "_server.md")]) {
      const path = join(casesDir, slug, f);
      if (!existsSync(path) || !readFileSync(path, "utf8").includes(CHECKS_RULE_START))
        problems.push(`${slug}/${f}: no checks rule`);
    }
  }
  return problems;
}

export function checkGenerated(outDir, pluginDir) {
  const casesDir = join(outDir, "cases");
  return [
    ...checkChecksRule(casesDir),
    ...checkServers(outDir, casesDir),
    ...checkSkills(outDir, pluginDir),
    ...checkLeaks(casesDir),
  ];
}
