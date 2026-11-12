// Writes one outcome case: prompt, graders, and the mocked GitHub world.
//
// Both arms get the same prompt and the same two GitHub tools, a `gh` CLI tool
// and the GitHub MCP server. Each is an agent mock: the judge model answers as
// that tool from one facts document per scenario, so the two tools agree.
// The case's mocks/gh and mocks/github match no server a plugin declares, so
// plugin eval serves them standalone in BOTH arms. mocks/pr-shepherd matches the
// plugin's own server, so its `iterate` (a recorded Shepherd tick) exists only
// in the with-plugin arm. Δ is therefore "plugin + Shepherd + GitHub tools" vs
// "GitHub tools alone".

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureText, mustChange } from "../lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const json = (name) => readFileSync(join(HERE, name), "utf8");

const MODEL = "claude-sonnet-5-5";
const MAX_TURNS = 16;

const SYSTEM = `You have no shell and cannot edit files. You are connected to GitHub through
MCP tools: the GitHub MCP server, and a \`gh\` tool that runs the GitHub CLI.
Other tools may also be available.

You MAY use any skill available to you. If a skill is relevant to this request,
load it before you act. If that skill points at a reference file, read it.

Use your tools to inspect the pull request. When you decide on a GitHub action
that needs no code change (a reply, comment, review dismissal, rerun, review
request, merge, or queue change), you may take it with a tool or state it as a
step. Code changes, commits and pushes cannot happen here: state each one as a
concrete numbered step, with the exact command where one applies.

This is one pass. Do not re-check the pull request to see the effect of your
own actions. End with numbered steps for everything still to do, including
what you would do after those steps. Where you decide NOT to take an action
that the pull request's state appears to offer, say so and why.`;

const GRADE_PREFACE = `The agent had GitHub tools (the \`gh\` CLI, the GitHub MCP server, and possibly
pr-shepherd) but no shell and no file editing, so code changes, commits and
pushes can only appear as plan steps. Grade the tool calls it made and the steps
it committed to together; a step that gives a command counts as running it.
Which tool it used does not matter, only what it did and committed to.`;

const ghBody = (world) => `You are the GitHub CLI (\`gh\` 2.83.0) in a checkout of owner/repo, authenticated
as \`you\`, the author of PR #42. Answer each call with exactly what \`gh\` would
print: stdout, or stderr followed by \`exit code N\`. Print nothing else.

Use only the facts below. Do not invent reviews, comments, checks, logs, runs or
events beyond them; where they are silent, answer as GitHub would for a repository
with nothing more. Commands that change state succeed and print what \`gh\` prints
on success. GitHub is healthy: never answer with a 5xx, timeout or rate-limit
error. Earlier calls are in your history: keep later answers consistent with
them.

${world}`;

const githubBody = (world) => `You are the GitHub MCP server (github-mcp-server). Answer each tool call with
exactly the JSON (or, for logs, the text) the real server returns, and nothing
else. The caller is \`you\`, the author of PR #42 in owner/repo.

Use only the facts below. Do not invent reviews, comments, checks, logs, runs or
events beyond them; where they are silent, answer as GitHub would for a repository
with nothing more. Calls that change state succeed and return what the server
returns on success. GitHub is healthy: never answer with a 5xx, timeout or
rate-limit error. Log tools return the log text inline, never a download URL.
Earlier calls are in your history: keep later answers consistent with them.

${world}`;

const GITHUB_TOOLS = JSON.parse(json("github-tools.json")).tools.map((t) => t.name);

const frontmatter = (spec) =>
  [
    "---",
    `model: ${MODEL}`,
    `runs: ${spec.runs ?? 3}`,
    `max_turns: ${MAX_TURNS}`,
    `timeout_seconds: 600`,
    // Without this the eval runs in dont-ask mode and denies the Skill tool.
    "allowed_tools: [Read, Glob, Grep, Skill]",
    `tags: [outcome, ${spec.slug}, ${spec.tags.join(", ")}]`,
    `append_system_prompt: |`,
    ...SYSTEM.split("\n").map((l) => (l ? `  ${l}` : "")),
    "---",
  ].join("\n");

function grader(spec) {
  return ["---", "type: llm", "focus: trace", "weight: 1", "---", "", GRADE_PREFACE, "", spec.grader].join(
    "\n",
  );
}

const SKILL_FIRED = [
  "---",
  "type: tool_used",
  "tool: Skill",
  String.raw`input_match: '"skill"\s*:\s*"(?:[\w-]+:)?pr-shepherd"'`,
  "min: 1",
  "---",
].join("\n");

function put(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}

export function writeOutcomeCase(spec, outDir) {
  let tick = fixtureText(spec.fixture);
  if (spec.transform) tick = mustChange(spec.slug, tick, spec.transform);
  const dir = join(outDir, spec.slug);
  rmSync(dir, { recursive: true, force: true });

  put(join(dir, "prompt.md"), `${frontmatter(spec)}\n${spec.prompt}`);
  put(join(dir, "graders", "outcome.md"), grader(spec));
  put(join(dir, "graders", "skill-fired.md"), SKILL_FIRED);

  const world = spec.world.trim();
  put(join(dir, "mocks", "gh", "_tools.json"), json("gh-tools.json"));
  put(join(dir, "mocks", "gh", "gh.md"), `---\ntype: agent\n---\n\n${ghBody(world)}`);
  put(join(dir, "mocks", "github", "_tools.json"), json("github-tools.json"));
  put(
    join(dir, "mocks", "github", "_server.md"),
    `---\ntype: agent\ntools: [${GITHUB_TOOLS.join(", ")}]\n---\n\n${githubBody(world)}`,
  );

  // Fixed mocks: every `iterate` call returns the recorded tick, and `apply` and
  // `suggest` report success, so the with-plugin arm's Shepherd path works.
  put(join(dir, "mocks", "pr-shepherd", "_tools.json"), json("pr-shepherd-tools.json"));
  put(join(dir, "mocks", "pr-shepherd", "iterate.md"), tick);
  put(join(dir, "mocks", "pr-shepherd", "apply.md"), "Applied every requested operation.");
  put(
    join(dir, "mocks", "pr-shepherd", "suggest.md"),
    "No eligible suggestion patches.",
  );
  console.log(`${spec.slug.padEnd(36)} ${spec.fixture}`);
}
