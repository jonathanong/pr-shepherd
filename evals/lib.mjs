// Shared framing, grader helpers and the case writer for generate.mjs.
// See generate.mjs for why the cases look the way they do.

import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(EVALS_DIR);
const SNAPSHOTS = join(REPO_ROOT, "test-cases", "snapshots");

const MODEL = "claude-sonnet-5-5";
const RUNS = 3;

// `plugin eval` has no effort flag or frontmatter key, but it forwards a case's
// `env:` block and passes `CLAUDE_CODE_*` through to child runs. The previously
// tried ambient `CLAUDE_EFFORT` is not on that allowlist and was inert. Whether
// this variable actually moves reasoning effort is recorded in EVALS.md.
const ENV = { CLAUDE_CODE_EFFORT_LEVEL: "low" };

// No tool can accomplish these cases; the written plan is the deliverable. The
// read-only default needs no operator grant, which is also what keeps the suite
// runnable on a machine where `--allow-tools Bash` is refused.
const ALLOWED_TOOLS = "[Read, Glob, Grep, Skill]";

// The middle paragraph is load-bearing. Without it the model reads "do not run
// commands" as "use no tools", never loads the skill, and both arms collapse to
// the same answer — which is exactly what the first pilot produced.
//
// The final sentence is what makes a *declined* action observable, so "chose not
// to rerun" can be graded as a positive statement rather than inferred from a
// missing string.
const APPEND_SYSTEM_PROMPT = `You have no shell and no network access. Do not run shell commands, fetch
anything over the network, or read repository files other than a reference
file linked from a skill you loaded. Do not ask for the repository to be provided.

You MAY use any skill available to you. If a skill is relevant to this request,
load it before you plan. If that skill points at a reference file, read it
before you plan.

State the plan you would execute, as concrete numbered steps that someone could
follow without you. Where a step runs a command, give the exact command. Where
you decide NOT to take an action that the output appears to offer, say so
explicitly and say why.`;

const APPEND_SYSTEM_PROMPT_NEG = `You have no shell and no network access. Do not run shell commands, fetch
anything over the network, or read repository files other than a reference
file linked from a skill you loaded. Do not ask for the repository to be provided.

You MAY use any skill available to you. If a skill is relevant to this request,
load it before you answer. If that skill points at a reference file, read it
before you answer.

Answer from your own knowledge.`;

const PR_URL = "https://github.com/owner/repo/pull/42";

// Both wrappers open with "shepherd this PR", matching how the skill is actually
// invoked in real traffic ("/pr-shepherd:pr-shepherd <url>", "have a subagent
// shepherd this PR", "Run pr-shepherd on existing PR #10348"). Real prompts are
// terse — a URL and a verb — with all the complexity living in the CLI output,
// so the fixture carries the state and the wrapper only sets the task.

/** Dispatcher framing: continue an already-started shepherd loop. */
export const shapeA = (fixture) =>
  `Shepherd ${PR_URL} through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

${fixture}`;

/** Task framing: a goal plus the output as evidence. */
export const shapeB = (fixture) =>
  `PR #42 is blocked and I need it moving again. I ran pr-shepherd on
${PR_URL} and got this back — what do we do now?

---

${fixture}`;

/**
 * Stack framing: shepherd a native stack from its anchor PR. `merge` mirrors the
 * user asking to land the stack, which is what authorises `gh stack merge` —
 * without it a MERGE fixture would test an action the user never requested.
 */
export const stackShape =
  (anchor, { merge = false } = {}) =>
  (fixture) =>
    `Shepherd the native PR stack anchored at ${anchor}${merge ? " and merge it" : ""}.
I already ran the first tick (\`pr-shepherd --stack ${anchor} --until-terminal${merge ? " --merge" : ""}\`) —
here is what it returned. Take it from there.

---

${fixture}`;

// --- grader helpers ---------------------------------------------------------

export const llm = (body, weight = 1) => ({
  frontmatter: [`type: llm`, `focus: last_message`, `weight: ${weight}`],
  body,
});

export const regex = (pattern, { match = "contains", weight = 1, flags = "i" } = {}) => ({
  frontmatter: [
    `type: regex`,
    `target: last_message`,
    `match: ${match}`,
    `flags: ${flags}`,
    `weight: ${weight}`,
  ],
  body: pattern,
});

// Display-only trigger indicator. `arm` is deliberately unset: under ablation the
// runner reports it as a plugin-fired indicator and excludes it from the score in
// both arms, so it never moves Δ. Present on the should-NOT-fire case too, where
// a red row is the expected and desired reading — that is the only way
// over-triggering becomes visible if the skill description is ever widened.
// `input_match` is required, not decoration: the plugin ships more than one
// skill, so a bare `tool: Skill` would also count a `mark-files-as-viewed`
// invocation as this skill firing. The optional `[\w-]+:` allows the
// plugin-namespaced form ("pr-shepherd:pr-shepherd") as well as a bare one.
export const skillFired = {
  frontmatter: [
    `type: tool_used`,
    `tool: Skill`,
    String.raw`input_match: '"skill"\s*:\s*"(?:[\w-]+:)?pr-shepherd"'`,
    `min: 1`,
  ],
  body: null,
};

// Reused verbatim across the non-terminal cases. Halting on a non-terminal action
// is failure mode 3 and shows up for WAIT, MARK_READY and FIX_CODE alike.
export const ITERATES_AGAIN = `The plan commits to running pr-shepherd again to continue the loop, rather than
stopping to report, to ask permission, or to wait for something.

Only \`[ESCALATE]\` hands work back to a human, and only \`[CANCEL]\` ends the loop.
Every other action — including this one — is non-terminal, and the agent is
expected to continue without being asked.

The POSITION of that step does not matter. Where there is no work to do first,
re-running immediately as step 1 is correct and should pass; where work must
happen first, iterating after it is correct and should pass. A plan that also
describes how it will dispatch on the NEXT tick's action still passes — extra
detail is not a defect.

Passing responses state somewhere that they iterate / re-run pr-shepherd with the
same options to continue.

Failing responses do any of: end by asking the user whether to continue; present
the work as finished; stop to write a status report; wait for something before
the next tick; treat a push as the end of the loop.`;

// Stack-level twin of ITERATES_AGAIN. The stack loop continues by rerunning the
// same `--stack` selector after the per-layer work, not by re-shepherding one PR.
export const ITERATES_STACK_AGAIN = `The plan commits to rerunning the same \`pr-shepherd --stack …\` selector after
the per-layer work the output lists, to continue the stack loop.

A stack overview whose heading carries neither \`[CANCEL]\` nor \`[ESCALATE]\` is
non-terminal: the agent is expected to continue without being asked.

Passing responses state that, once the listed one-PR sessions have run (or while
they run), they rerun the stack command. Where the output lists no one-PR work
(a stack-level wait), rechecking at the polling cadence with the same stack
command is correct and should pass. Describing how the NEXT tick will be handled
is extra detail, not a defect.

Failing responses do any of: end after the one-PR sessions without rerunning the
stack command; ask the user whether to continue; present the stack as finished;
replace the stack loop with a hand-rolled per-PR merge sequence.`;

// --- emit -------------------------------------------------------------------

function fixtureText(name) {
  const path = join(SNAPSHOTS, name, "output.text.md");
  if (!existsSync(path)) throw new Error(`missing snapshot: ${path}`);
  return readFileSync(path, "utf8").trimEnd();
}

export function writeCase(spec) {
  const dir = join(EVALS_DIR, spec.slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "graders"), { recursive: true });

  const body = spec.fixture ? spec.shape(fixtureText(spec.fixture)) : spec.prompt;
  const append = spec.fixture ? APPEND_SYSTEM_PROMPT : APPEND_SYSTEM_PROMPT_NEG;

  const frontmatter = [
    "---",
    `model: ${MODEL}`,
    `runs: ${RUNS}`,
    `max_turns: 6`,
    `timeout_seconds: 300`,
    `allowed_tools: ${ALLOWED_TOOLS}`,
    `tags: [${spec.tags.join(", ")}]`,
    `env:`,
    ...Object.entries(ENV).map(([k, v]) => `  ${k}: ${v}`),
    `append_system_prompt: |`,
    ...append.split("\n").map((l) => (l ? `  ${l}` : "")),
    "---",
  ].join("\n");

  writeFileSync(join(dir, "prompt.md"), `${frontmatter}\n${body}\n`);

  for (const [name, grader] of Object.entries(spec.graders)) {
    const text = ["---", ...grader.frontmatter, "---"];
    if (grader.body) text.push("", grader.body);
    writeFileSync(join(dir, "graders", `${name}.md`), `${text.join("\n")}\n`);
  }

  const n = Object.keys(spec.graders).length;
  console.log(
    `${spec.slug.padEnd(38)} ${String(n).padStart(2)} graders  ${spec.fixture ?? "(no fixture)"}`,
  );
}

// Prune case directories that are no longer in CASES. Without this, renaming or
// removing a case leaves its old directory on disk, where `claude plugin eval .`
// still discovers and runs it — so the suite silently executes more cases than
// this generator and the docs describe. Renumbering the suite during
// development hit exactly that, twice.
export function pruneStaleCases(keep) {
  const wanted = new Set(keep);
  const stale = readdirSync(EVALS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{2}-/.test(e.name) && !wanted.has(e.name))
    .map((e) => e.name);

  for (const name of stale) {
    rmSync(join(EVALS_DIR, name), { recursive: true, force: true });
    console.log(`${"pruned stale case".padEnd(38)}    ${name}`);
  }
  return stale.length;
}
