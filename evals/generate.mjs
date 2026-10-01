#!/usr/bin/env node
// Generates evals/<case>/prompt.md and evals/<case>/graders/*.md.
//
// Source of truth: edit this file, not the generated cases — a hand edit to a
// generated case is lost on the next run. Run with `node evals/generate.mjs`.
//
// ---------------------------------------------------------------------------
// Why the cases look like this
// ---------------------------------------------------------------------------
//
// No case runs the CLI. `claude plugin eval` grants Bash only via the operator
// `--allow-tools` flag (a case's own `allowed_tools` can narrow but never grant,
// and a skill's `allowed-tools:` frontmatter does not grant either), and that
// flag is refused outright on machines whose ~/.docker holds a symlink.
//
// That constraint turns out to fit the plugin. The skill is a thin dispatcher —
// parse args, invoke the CLI, print the output, follow the output's own
// `## Instructions` — so its behaviour is text-in/behaviour-out. Embedding a
// recorded CLI output makes the input perfectly deterministic and puts the
// measurement where the skill's value actually is: routing and rule application.
//
// Fixtures come from test-cases/snapshots/<name>/output.text.md, read verbatim
// at generation time. Those files are regression-tested by the repo's own
// snapshot suite, so the eval prompts cannot drift from what the CLI emits.
//
// Both ablation arms receive identical fixture text. The only difference is
// whether the skill is loaded, so Δ is the effect of the dispatcher plus any
// reference it tells the agent to open. A firing skill puts SKILL.md in
// context. On-demand playbooks live in references/*.md and are not inlined.
// Several rules under test (the CI-watcher prohibition, "only ESCALATE hands
// work to a human") stay in the dispatcher. Isolating the playbooks would
// need a third arm carrying a playbook-stripped copy of the skill.
//
// The fixtures name those rules with `Playbook: "CI failure triage".` without
// restating them — that pointer is the seam under test.
//
// ---------------------------------------------------------------------------
// Calibrated against a pilot run and against real transcripts
// ---------------------------------------------------------------------------
//
// A first pilot scored mean Δ 0.00 with `Skill called 0x` on every case: the
// environment framing said "do not run commands or read files", which the model
// read as "use no tools at all", so it never loaded the skill and the with-arm
// was identical to the baseline. The framing below explicitly permits skills.
//
// Case selection and grader phrasing were then rebuilt against ~4,700 real
// pr-shepherd invocations mined from Claude, Codex and Grok transcripts. What
// that corpus actually shows, in order of frequency:
//
//   1. Blocking on `gh pr checks --watch` / `gh run watch` instead of letting
//      the CLI poll. 83 blocking executions across 41 Grok sessions, 22 in one
//      Codex session, 8 in one Claude subagent — and 34 distinct user prompts
//      that had to add "do not use gh pr checks" to the standing instructions.
//      This is the dominant failure and the biggest context sink in the loop.
//   2. Claiming a PR is terminal while CHANGES_REQUESTED still stands, having
//      skipped the generated `apply review:` command entirely.
//   3. Halting on a non-terminal action (MARK_READY, FIX_CODE) and handing back
//      to the human.
//   4. Treating `[rerun authorized]` as a recommendation, rerunning a real
//      failure — and rerunning again after it reproduced identically.
//
// Two assumptions the corpus disproved, so nothing here tests them:
//   - Agents do NOT truncate `--dismiss-review-ids`. Both miners found zero
//     instances. They skip the whole command instead (failure 2), so that is
//     what the graders check.
//   - Unsubstituted `$HEAD_SHA` / `$DISMISS_MESSAGE` never reached an executed
//     command. Zero instances across all three tools.

//
// Layout: lib.mjs holds the framing, grader helpers and writer; cases/*.mjs hold
// the case specs. Case numbers are stable — append, never renumber.

import { CORE_CASES } from "./cases/core.mjs";
import { RECENT_CASES } from "./cases/recent.mjs";
import { STACK_CASES } from "./cases/stack.mjs";
import { EVALS_DIR, pruneStaleCases, writeCase } from "./lib.mjs";

const CASES = [...CORE_CASES, ...STACK_CASES, ...RECENT_CASES];

const slugs = CASES.map((c) => c.slug);
const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
if (dupes.length) throw new Error(`duplicate case slugs: ${dupes.join(", ")}`);

for (const spec of CASES) writeCase(spec);
const pruned = pruneStaleCases(slugs);
console.log(
  `\n${CASES.length} cases written to ${EVALS_DIR}` +
    (pruned ? ` · ${pruned} stale case director${pruned === 1 ? "y" : "ies"} pruned` : ""),
);
