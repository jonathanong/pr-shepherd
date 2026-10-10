import { readdirSync, readFileSync } from "node:fs";

import { EXIT, ShepherdError } from "../exit-codes.mts";

/**
 * Playbooks ship with the package under `plugins/pr-shepherd/skills/pr-shepherd/references/`
 * (package.json `files` includes `plugins/**`), so a playbook pointer resolves
 * with or without the skill installed. From `bin/commands/` or `src/commands/`, `../../` is
 * the package root.
 */
const REFERENCES_DIR = new URL(
  "../../plugins/pr-shepherd/skills/pr-shepherd/references/",
  import.meta.url,
);

interface Playbook {
  /** The playbook's name: the H1 of its reference file. Pointers cite this name. */
  name: string;
  /** Reference file name without extension, an accepted alias for `name`. */
  slug: string;
  content: string;
}

export type PlaybookResult = { playbooks: string[] } | { name: string; content: string };

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Every shipped playbook, sorted by name. */
function listPlaybooks(): Playbook[] {
  return readdirSync(REFERENCES_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const content = readFileSync(new URL(file, REFERENCES_DIR), "utf8");
      const slug = file.slice(0, -".md".length);
      return {
        name: /^# (.+)$/m.exec(content)?.[1]?.trim() ?? slug,
        slug,
        content,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a playbook by name (case-insensitive; spaces and hyphens are equivalent) or file
 * slug. With no name, list every playbook name. Unknown names fail with the available names.
 */
export function runPlaybook(name?: string): PlaybookResult {
  const playbooks = listPlaybooks();
  if (name === undefined || name.trim() === "") return { playbooks: playbooks.map((p) => p.name) };
  const wanted = normalize(name);
  const match = playbooks.find((p) => normalize(p.name) === wanted || p.slug === wanted);
  if (!match) {
    throw new ShepherdError(
      `Unknown playbook ${JSON.stringify(name)}. Available: ${playbooks.map((p) => JSON.stringify(p.name)).join(", ")}`,
      EXIT.USAGE,
    );
  }
  return { name: match.name, content: match.content };
}

/** Markdown projection shared by the CLI text format and the MCP content channel. */
export function formatPlaybookResult(result: PlaybookResult): string {
  return "playbooks" in result
    ? result.playbooks.map((name) => `- ${name}`).join("\n")
    : result.content.trimEnd();
}
