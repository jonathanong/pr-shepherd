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
// whether the skill's `## Playbooks` are in context, so Δ isolates exactly what
// the playbooks add. The fixtures reference those playbooks by name ("See
// 'CI failure triage' in the pr-shepherd skill") without restating the rule —
// that dangling reference is the seam under test.
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

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(EVALS_DIR);
const SNAPSHOTS = join(REPO_ROOT, "test-cases", "snapshots");

const MODEL = "claude-opus-5";
const RUNS = 3;

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
const APPEND_SYSTEM_PROMPT = `You have no shell, no network access, and no repository checkout in this
environment. Do not attempt to run shell commands, read repository files, or
fetch anything over the network, and do not ask for the repository to be
provided.

You MAY use any skill available to you. If a skill is relevant to this request,
load it before you plan.

State the plan you would execute, as concrete numbered steps that someone could
follow without you. Where a step runs a command, give the exact command. Where
you decide NOT to take an action that the output appears to offer, say so
explicitly and say why.`;

const APPEND_SYSTEM_PROMPT_NEG = `You have no shell, no network access, and no repository checkout in this
environment. Do not attempt to run shell commands, read repository files, or
fetch anything over the network, and do not ask for the repository to be
provided.

You MAY use any skill available to you. If a skill is relevant to this request,
load it before you answer.

Answer from your own knowledge.`;

const PR_URL = "https://github.com/owner/repo/pull/42";

// Both wrappers open with "shepherd this PR", matching how the skill is actually
// invoked in real traffic ("/pr-shepherd:pr-shepherd <url>", "have a subagent
// shepherd this PR", "Run pr-shepherd on existing PR #10348"). Real prompts are
// terse — a URL and a verb — with all the complexity living in the CLI output,
// so the fixture carries the state and the wrapper only sets the task.

/** Dispatcher framing: continue an already-started shepherd loop. */
const shapeA = (fixture) =>
  `Shepherd ${PR_URL} through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

${fixture}`;

/** Task framing: a goal plus the output as evidence. */
const shapeB = (fixture) =>
  `PR #42 is blocked and I need it moving again. I ran pr-shepherd on
${PR_URL} and got this back — what do we do now?

---

${fixture}`;

// --- grader helpers ---------------------------------------------------------

const llm = (body, weight = 1) => ({
  frontmatter: [`type: llm`, `focus: last_message`, `weight: ${weight}`],
  body,
});

const regex = (pattern, { match = "contains", weight = 1, flags = "i" } = {}) => ({
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
const skillFired = { frontmatter: [`type: tool_used`, `tool: Skill`, `min: 1`], body: null };

// Reused verbatim across the non-terminal cases. Halting on a non-terminal action
// is failure mode 3 and shows up for WAIT, MARK_READY and FIX_CODE alike.
const ITERATES_AGAIN = `The plan commits to running pr-shepherd again to continue the loop, rather than
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

// --- cases ------------------------------------------------------------------

const CASES = [
  {
    // Flagship. The single most common real failure: blocking on a CI watcher
    // instead of letting the CLI poll. The skill forbids it by name; the
    // baseline has no such rule and a watch looks locally sensible.
    slug: "01-ci-in-progress-no-watch",
    fixture: "09-wait-in-progress-ci",
    shape: shapeA,
    tags: ["wait", "efficiency"],
    graders: {
      "does-not-block-on-a-ci-watcher": llm(
        `The plan does NOT wait for the in-progress check to finish before doing
anything else.

Specifically, it must not propose \`gh pr checks --watch\`, \`gh pr watch\`,
\`gh run watch\`, an equivalent GitHub MCP check-waiter, or a sleep/poll loop of
its own to block until \`CI / build\` completes. pr-shepherd already owns the
polling; a blocking watcher duplicates it and stalls the loop.

Passing responses iterate again immediately. Explicitly declining to watch CI and
saying why is CORRECT and should pass.

Failing responses do any of: propose any command that blocks until checks
complete; sleep and re-check in the same turn; say they will "wait for CI" before
the next tick.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Verified real incident: the CLI returned MARK_READY with "Iterate again
    // with the same options to continue" and the agent stopped anyway, prompting
    // "what? why did you stop at MARK_READY?".
    slug: "02-mark-ready-continue",
    fixture: "07-mark-ready-draft-clean",
    shape: shapeA,
    tags: ["mark-ready"],
    graders: {
      "treats-mark-ready-as-non-terminal": llm(
        `The response recognises that \`[MARK_READY]\` is non-terminal: the CLI has
already converted the draft to ready, and the correct next step is to iterate
again rather than to stop.

Judge ONLY that question — continue versus stop. A response that continues passes
however briefly or elaborately it does so; describing how it will handle the next
tick's action, or restating the loop's rules, is extra detail and not a defect.

Passing responses continue the loop.

Failing responses do any of: stop and report that the PR was marked ready; ask the
user whether to proceed; treat marking ready as completing the task; wait for CI
to start before continuing.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Four categories at once. This is the "complex PR situation" case: the
    // model has to hold threads, comments, a failing check and a
    // changes-requested review in mind simultaneously and drop none of them.
    slug: "03-multi-category-fix",
    fixture: "54-fix-code-multi-category-threads-comments-checks-changes",
    shape: shapeA,
    tags: ["fix-code", "complex"],
    graders: {
      "addresses-every-category": llm(
        `The plan addresses ALL FOUR categories of work in the output, not a subset:
the review thread PRRT_multi (extract a helper in src/index.ts), the actionable
comment IC_multi (mention the new flag in the README), the failing check
\`CI > tests\`, and the changes-requested review PRR_multi_cr.

Passing responses walk the categories and commit to an action for each.

Failing responses do any of: silently drop a category; address only the failing
check; treat the changes-requested review as satisfied without addressing the
inline note and the comment; defer categories to "a later pass" without saying
what happens to them now.`,
      ),
      "runs-the-generated-apply-command": llm(
        `The plan commits to running the generated \`apply review:\` command.

That command records the agent's disposition of the review items. Skipping it
leaves authorized threads active and the PR stuck — in real traffic this is the
most common way a PR is wrongly reported as finished. It must be run even when
the agent concludes no code change is warranted.

Passing responses include running it as an explicit step.

Failing responses do any of: omit it; describe resolving threads through the
GitHub UI instead; make it conditional on having changed code; mention it only in
passing without committing to run it.`,
      ),
      "keeps-the-thread-id": regex(`--reply-thread-ids\\s+PRRT_multi`, { weight: 0.5 }),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Fixture 61 rather than 11: it carries real log evidence
    // (`##[error]Process completed with exit code 1`, two named failing jobs).
    // Fixture 11's only detail is the step name, so an agent that wants to read
    // logs before deciding is behaving correctly there and the grader was unfair.
    slug: "04-real-failure-no-blind-rerun",
    fixture: "61-fix-code-aggregate-ci-exit-code",
    shape: shapeA,
    tags: ["fix-code", "ci-triage"],
    graders: {
      "does-not-treat-rerun-as-the-default": llm(
        `The plan does NOT treat \`[rerun authorized]\` as a recommendation to rerun.

The output names two failing jobs (\`test-playwright\`, \`test-playwright-credentialed\`)
and an \`##[error]Process completed with exit code 1\`. That is evidence of tests
failing, not of infrastructure flaking. The rule: a real test or build failure
gets a code fix even when a rerun is authorized.

Passing responses either commit to investigating and fixing the failing tests, or
inspect the specific failing jobs' evidence before deciding — and say clearly that
a rerun is not the default response. Explicitly declining the rerun passes.

Failing responses do any of: schedule \`gh run rerun\` as the primary response;
rerun "to see if it's flaky" before looking at the failure; describe
\`[rerun authorized]\` as shepherd advising a rerun.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Deliberate mirror of case 04. On its own, a grader that penalises reruns is
    // gamed by never rerunning; this case punishes exactly that, so the pair only
    // means anything together.
    slug: "05-cancelled-must-rerun",
    fixture: "14-fix-code-cancelled-conclusion",
    shape: shapeB,
    tags: ["fix-code", "ci-triage"],
    graders: {
      "issues-the-rerun": regex(`gh run rerun\\s+555`, { weight: 1 }),
      "treats-cancelled-as-not-a-code-defect": llm(
        `The plan recognises that a \`[conclusion: CANCELLED]\` check is not evidence of
a code defect, and reruns it rather than trying to fix code for it.

A cancelled run produced no failure signal — no log excerpt is rendered — so there
is nothing to fix. The correct move is to run the printed rerun command and
continue iterating without waiting for it to finish.

Passing responses run the rerun and continue.

Failing responses do any of: propose code changes for the cancelled check;
escalate over it; block and wait for the rerun to finish; declare the PR
unfixable.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    // Reframed after the transcript mining: the observed failure is skipping the
    // pending command wholesale, not editing its ID list. Zero truncated ID lists
    // were found across three tools.
    slug: "06-escalate-stop-and-ask",
    fixture: "60-escalate-bot-cr-not-dismissed",
    shape: shapeA,
    tags: ["escalate"],
    graders: {
      "stops-and-asks-the-user": llm(
        `The response treats \`[ESCALATE]\` as terminal: it stops polling and asks the
user whether to run the pending review commands, rather than running them
autonomously or iterating again.

\`[ESCALATE]\` is the ONLY action that hands work back to a human — the opposite of
\`[FIX_CODE]\` and \`[WAIT]\`, where continuing without asking is required.
Conflating the two is the failure this case checks for.

Passing responses stop and put the decision to the user.

Failing responses do any of: run the pending commands without asking; re-run
pr-shepherd to continue the loop; treat the escalation as informational and carry
on with other work.`,
      ),
      "surfaces-the-pending-command-intact": llm(
        `The response carries the pending \`apply review:\` command forward to the user
rather than dropping it.

The escalation exists precisely because two bot CHANGES_REQUESTED reviews are
still undismissed; the command that would dismiss them is the point of the
handoff. Presenting the escalation without it leaves the user unable to act.

Passing responses show or reference the pending command, including both review
IDs, as what they are asking permission to run.

Failing responses do any of: summarise the escalation without the command; name
only one of the two reviews; tell the user to resolve it manually with no
reference to the generated command.`,
      ),
      "retains-both-dismiss-ids": regex(`PRR_bot_overdue,PRR_bot_new`, { weight: 0.5 }),
      "skill-fired": skillFired,
    },
  },

  {
    // Sibling of case 06, different temptation: real actionable work is visible
    // and the action is still ESCALATE. Tests precedence, not just stopping.
    slug: "07-escalate-beats-available-work",
    fixture: "84-escalate-bot-cr-beats-fix-thrash",
    shape: shapeB,
    tags: ["escalate"],
    graders: {
      "escalation-wins-over-the-open-thread": llm(
        `The response stops and asks the user, even though an actionable review thread
(\`PRRT_thrash_84\`, "authentication logic is too complex") is visible and could be
worked on.

\`[ESCALATE]\` takes precedence over available work: the agent does not get to pick
off the tractable item first and escalate afterwards.

Passing responses stop, surface the escalation, and put the decision to the user.

Failing responses do any of: start simplifying the auth logic; run the pending
command without asking; treat the thread as work to complete before escalating;
iterate again.`,
      ),
      "retains-the-dismiss-id": regex(`--dismiss-review-ids\\s+PRR_bot_overdue_84`, {
        weight: 0.5,
      }),
      "skill-fired": skillFired,
    },
  },

  {
    // Reproduces a failure the author reports seeing repeatedly: agents calling a
    // PR "blocked on an approver" when the output says approvals are NOT required
    // and the real blocker is something else.
    //
    // Known limitation: no fixture in the 93-snapshot corpus has a genuinely
    // `[Required]` gate (89 are `Approvals: None [Not Required]`), so there is no
    // true-positive mirror. The grader therefore demands correct positive
    // identification of the real blocker rather than mere absence of the word
    // "approval", which would be one-directional and gameable.
    slug: "08-mergeability-diagnosis",
    fixture: "32-fix-code-pr-level-changes-requested",
    shape: shapeB,
    tags: ["fix-code", "mergeability"],
    graders: {
      "names-the-real-blocker": llm(
        `The response identifies the PR-level changes-requested review from @architect
(\`PRR_prlevel\`) as what is holding this PR up.

Passing responses name that review as the blocker and address its substance (the
architecture concern) — optionally noting that merge is \`CLEAN\`, approvals are
not required, and conversations are already resolved.

Failing responses do any of: claim the PR needs an approval, a reviewer sign-off,
or "an approver" before it can merge; report it as blocked on required
conversation resolution; say CI is the blocker; state that nothing is blocking
it.`,
      ),
      "reads-not-required-correctly": llm(
        `The response does NOT treat the approval or conversation-resolution lines as
unmet requirements.

The output states \`Approvals: None [Not Required]\` and \`Conversations Resolved:
Yes [Not Required]\`. The \`[Not Required]\` marker means this repository does not
gate merges on either, so "None" approvals is not a blocker and presenting it as
one is a misreading.

Passing responses either ignore those lines as non-blocking or explicitly note
they are not required.

Failing responses do any of: list "needs approval" / "awaiting an approver" /
"zero approvals" among the reasons the PR cannot merge; recommend requesting a
reviewer in order to unblock merging; describe conversation resolution as an
outstanding merge requirement.`,
      ),
      "identifies-review-id": regex(`PRR_prlevel`, { weight: 0.5 }),
      "skill-fired": skillFired,
    },
  },

  {
    // Terminal beats all work. The same output that says MERGED also shows
    // `merge DIRTY`, a branch conflicting with base, and unresolved
    // conversations — bait for a model that pattern-matches "conflicts".
    slug: "09-cancel-terminal-beats-work",
    fixture: "82-cancel-terminal-beats-all-work",
    shape: shapeA,
    tags: ["cancel", "mergeability"],
    graders: {
      "stops-because-merged": llm(
        `The response recognises the PR is already MERGED, that \`[CANCEL]\` is terminal,
and that the correct action is to stop — no further polling, no work.

Passing responses stop and say the loop is complete because the PR merged.

Failing responses do any of: propose resolving the reported branch conflicts;
propose resolving the unresolved conversations; run review mutations; iterate
again; ask the user what to do next.`,
      ),
      "does-not-act-on-the-dirty-branch": llm(
        `The response does NOT treat \`merge DIRTY\` / "branch conflicts with PR base
main" / \`Conversations Resolved: No\` as work to be done.

Those are stale fields on an already-merged PR. They are bait: a merged PR needs
nothing regardless of what the mergeability and conversation lines say.

Passing responses either ignore those fields or explicitly note they no longer
matter now the PR is merged.

Failing responses plan a rebase, a conflict resolution, a thread resolution, or
any push against this PR.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "10-external-check-no-handoff",
    fixture: "12-fix-code-failing-check-external",
    shape: shapeA,
    tags: ["fix-code", "ci-triage"],
    graders: {
      // Recalibrated: the pilot showed both arms planning a sensible
      // investigation and still failing, because the rubric demanded an explicit
      // commitment to continue the loop. The bar is now "does not hand off",
      // which is the actual rule.
      "does-not-hand-off-to-a-human": llm(
        `The response does NOT escalate or hand this off to a human merely because the
failing check is an external status with no GitHub-hosted logs.

The rule: an external check with a URL is an autonomous investigation path —
inspect the provider, or reproduce the failure locally — not an escalation
trigger. A non-empty external URL does not by itself justify stopping.

Passing responses plan to investigate the external failure, in whatever order,
and keep ownership of the problem. Branching on what the provider reveals is
fine.

Failing responses do any of: escalate or ask the user to take over because the
check is external or opaque; declare the failure un-actionable without attempting
to investigate; stop the loop pending someone else's input.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "11-wait-no-work",
    fixture: "24-wait-review-summary-already-surfaced",
    shape: shapeB,
    tags: ["wait"],
    graders: {
      "continues-without-inventing-work": llm(
        `The response recognises that \`[WAIT]\` means there is nothing to do this tick,
that the correct next step is to iterate again, and it characterises the PR's
state correctly.

The output reads \`**summary** 1 passing · **remainingSeconds** 600\` and
\`WAIT: 1 passing, 0 in-progress\`. So: one check has PASSED, nothing is running,
and the 600 seconds is the ready-delay countdown — NOT a CI job in flight. There
are no review threads, no comments and no failing checks.

Passing responses say no action is needed now and that they will continue, and do
not misdescribe the state.

Failing responses do any of: claim a CI check is still running or in progress;
describe the 600 seconds as time remaining on a CI job; invent review work, code
changes or mutations the output does not contain; propose \`pr-shepherd apply\`
commands that were never emitted; declare the loop finished; ask the user what to
do.`,
      ),
      // A `not_contains` regex on "apply review" lived here and was removed: it
      // scored -0.33 against the with-arm in the pilot as a false positive. With
      // the playbooks loaded the agent correctly described the *general* next-tick
      // procedure ("run each printed mutation command verbatim (`apply review:`,
      // `resolve-only:` …); keep every --dismiss-review-ids ID") while inventing
      // no mutation for this tick — which the llm grader above passed 3-0. The
      // regex punished the string rather than the behaviour, penalising the arm
      // that was more precise. Absence checks on natural-language behaviour
      // belong in a rubric, not a pattern.
      "skill-fired": skillFired,
    },
  },

  {
    // Context-efficiency: the annotation already carries file, line and message.
    // Re-fetching the provider's page adds context and no information.
    slug: "12-annotations-already-surfaced",
    fixture: "55-fix-code-failing-check-annotations-with-thread",
    shape: shapeA,
    tags: ["fix-code", "complex", "efficiency"],
    graders: {
      "acts-on-the-surfaced-annotation": llm(
        `The plan acts on the check annotation already in the output —
\`src/util/parse.ts:18\`, "Empty input is not handled before indexing" — and
connects it to the review thread on the same line, which raises the same edge
case.

Passing responses fix the empty-input handling at that location and treat the
thread and the annotation as one underlying defect.

Failing responses do any of: state that the external Code Quality provider page
must be fetched before the failure can be diagnosed; treat the check and the
thread as two unrelated problems; skip the annotation because the check is
external.`,
      ),
      "does-not-demand-the-external-page": llm(
        `The plan does NOT make retrieving the external provider's page or full report
a prerequisite for acting.

The annotation already carries the file, the line and the message. Fetching
\`https://checks.example/code-quality\` would add context without adding
information.

Passing responses work from the surfaced annotation. Mentioning the URL as
optional corroboration is fine.

Failing responses make fetching the external report a required first step, or say
the failure cannot be understood without it.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "13-neg-github-review-api",
    fixture: null,
    tags: ["neg"],
    prompt: `In GitHub's API, what's the difference between a pull request review whose
state is CHANGES_REQUESTED and one that has been DISMISSED? Which webhook events
fire when a review gets dismissed, and does dismissing a review change its stored
state or add a separate record?`,
    graders: {
      "answers-the-question-directly": llm(
        `The response answers the GitHub API knowledge question directly: what
CHANGES_REQUESTED and DISMISSED mean for a review, and what happens on dismissal.

This is a general knowledge question. There is no pull request to iterate, no CLI
output to act on, and no repository in play. Treating it as PR-shepherding work is
the over-trigger this case guards against.

Passing responses explain the review states and the dismissal behaviour. Saying
that no PR-iteration tooling is needed here is CORRECT and should pass, as is
noting uncertainty about specific webhook payload details.

Failing responses do any of: ask which PR to iterate or for a PR URL; propose
running pr-shepherd, \`pr-shepherd apply\`, or a polling loop; produce a
shepherding plan instead of an answer; refuse to answer without a repository.`,
      ),
      "skill-fired": skillFired,
    },
  },
];

// --- emit -------------------------------------------------------------------

function fixtureText(name) {
  const path = join(SNAPSHOTS, name, "output.text.md");
  if (!existsSync(path)) throw new Error(`missing snapshot: ${path}`);
  return readFileSync(path, "utf8").trimEnd();
}

function writeCase(spec) {
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
  console.log(`${spec.slug.padEnd(34)} ${String(n).padStart(2)} graders  ${spec.fixture ?? "(no fixture)"}`);
}

// Prune case directories that are no longer in CASES. Without this, renaming or
// removing a case leaves its old directory on disk, where `claude plugin eval .`
// still discovers and runs it — so the suite silently executes more cases than
// this generator and the README describe. Renumbering the suite during
// development hit exactly that, twice.
function pruneStaleCases(keep) {
  const wanted = new Set(keep);
  const stale = readdirSync(EVALS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{2}-/.test(e.name) && !wanted.has(e.name))
    .map((e) => e.name);

  for (const name of stale) {
    rmSync(join(EVALS_DIR, name), { recursive: true, force: true });
    console.log(`${"pruned stale case".padEnd(34)}    ${name}`);
  }
  return stale.length;
}

for (const spec of CASES) writeCase(spec);
const pruned = pruneStaleCases(CASES.map((c) => c.slug));
console.log(
  `\n${CASES.length} cases written to ${EVALS_DIR}` +
    (pruned ? ` · ${pruned} stale case director${pruned === 1 ? "y" : "ies"} pruned` : ""),
);
