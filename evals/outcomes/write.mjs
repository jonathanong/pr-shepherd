// Writes one outcome case: prompt, graders, and the mocked GitHub world.
//
// Both arms get the same prompt and the same two GitHub tools, a `gh` CLI tool
// and the GitHub MCP server. Each is an agent mock: the judge model answers as
// that tool from one facts document per scenario, so the two tools agree.
// The case's mocks/gh and mocks/github match no server a plugin declares, so
// plugin eval serves them standalone in BOTH arms.
//
// The Shepherd CLI is the with-arm's only extra. The eval runs against an eval
// copy of the plugin (see generate.mjs) that declares one MCP server, `cli`,
// and mocks/cli matches it, so plugin eval serves it in the with-plugin arm
// only. Its single tool, `pr-shepherd`, runs the CLI like `gh` runs gh: the
// mock answers `pr-shepherd ...` calls from the scenario's recorded ticks.
// Neither arm has a pr-shepherd MCP server. Δ is therefore "plugin skills +
// Shepherd CLI + GitHub tools" vs "GitHub tools alone".

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureText, mustChange } from "../lib.mjs";
import { cliBody } from "./cli-mock.mjs";
import { ATOMIC_GRADER } from "./world.mjs";

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
step. Code changes, commits and pushes cannot happen in this pass: state each
one as a concrete numbered step, with the exact command where one applies. They
are still yours: you will make them yourself in your next pass, which has a
checkout, so do not say someone else has to make them.

This is one pass. Do not re-check the pull request to see the effect of your
own actions. End with numbered steps for everything still to do, including
what you would do after those steps. Write them as the steps you will take
next, not as tasks for the user; hand a step to the user only when it truly
needs a human. Where you decide NOT to take an action
that the pull request's state appears to offer, say so and why.`;

const GRADE_PREFACE = `The agent had GitHub tools (the \`gh\` CLI and the GitHub MCP server), possibly
with others, but no shell and no file editing, so code changes, commits and
pushes can only appear as plan steps. Grade the tool calls it made and the steps
it committed to together; a step that gives a command counts as running it.
Which tool it used does not matter, only what it did and committed to. Noting
that this pass cannot edit code is not a handoff when the agent still commits to
each change as its own next step.`;

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

/**
 * A real session starts with the repository's `AGENTS.md` loaded as project
 * instructions, so a scenario's repo rules go into both arms' system prompt.
 */
const withRepoInstructions = (system, text) =>
  text
    ? `${system}\n\nProject instructions from the repository's \`AGENTS.md\`, already loaded:\n\n${text}`
    : system;

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
    ...withRepoInstructions(SYSTEM, spec.repoInstructions)
      .split("\n")
      .map((l) => (l ? `  ${l}` : "")),
    "---",
  ].join("\n");

// A scenario with `atomic: true` ends in a stack merge: the outcome grader (3)
// passes any correct way of landing it, and the atomic grader (2) only the one
// atomic stack merge, so atomic scores 1.0, correct bottom-up 0.6, failure 0.
// The with-only `skill-fired` grader has no weight and is not scored.
function grader(spec, weight, body) {
  return ["---", "type: llm", "focus: trace", `weight: ${weight}`, "---", "", GRADE_PREFACE, "", body].join(
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
  put(join(dir, "graders", "outcome.md"), grader(spec, spec.atomic ? 3 : 1, spec.grader));
  if (spec.atomic) put(join(dir, "graders", "atomic.md"), grader(spec, 2, ATOMIC_GRADER));
  put(join(dir, "graders", "skill-fired.md"), SKILL_FIRED);

  const world = spec.world.trim();
  put(join(dir, "mocks", "gh", "_tools.json"), json("gh-tools.json"));
  put(join(dir, "mocks", "gh", "gh.md"), `---\ntype: agent\n---\n\n${ghBody(world)}`);
  put(join(dir, "mocks", "github", "_tools.json"), json("github-tools.json"));
  put(
    join(dir, "mocks", "github", "_server.md"),
    `---\ntype: agent\ntools: [${GITHUB_TOOLS.join(", ")}]\n---\n\n${githubBody(world)}`,
  );

  // The Shepherd CLI runner, with-arm only: see cli-mock.mjs.
  put(join(dir, "mocks", "cli", "_tools.json"), json("pr-shepherd-tools.json"));
  put(join(dir, "mocks", "cli", "pr-shepherd.md"), cliBody(spec, tick));
  console.log(`${spec.slug.padEnd(36)} ${spec.fixture}`);
}
