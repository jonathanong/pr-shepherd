// Case 62: a watch request that never names pr-shepherd. Agents asked to "let me
// know when it merges" wrote `until gh pr view … ; sleep` loops, a bespoke
// ejection watcher, and a `while pr-shepherd 5441 …; sleep 60` wrapper instead of
// one `--until-terminal` run. Each loop iteration spends GraphQL quota, and the
// gh loops miss ejections and failing checks that Shepherd reports.

import { PR_URL, llm, regex, skillFired } from "../lib.mjs";

export const WATCH_CASES = [
  {
    slug: "62-watch-queued-prs-no-custom-poller",
    tier: "discriminating",
    area: "loop",
    fixture: null,
    plan: true,
    tags: ["wait", "merge-queue", "efficiency"],
    prompt: `https://github.com/owner/repo/pull/41 and https://github.com/owner/repo/pull/42
are in the merge queue. Let me know when both have merged. If either one gets
kicked out of the queue, get it back in.`,
    graders: {
      "watches-with-pr-shepherd": regex(
        // One invocation naming both PRs with --until-terminal; spans shell line
        // continuations but stops at a newline or `;`, `&`, `|`.
        String.raw`pr-shepherd\b(?=(?:[^\n;&|]|\\\n)*\b41\b)(?=(?:[^\n;&|]|\\\n)*\b42\b)(?=(?:[^\n;&|]|\\\n)*--until-terminal)`,
      ),
      "no-custom-poller": llm(
        `The plan waits for both PRs with one \`pr-shepherd … --until-terminal\` run
covering #41 and #42 (with \`--merge\`, since the user asked to get an ejected PR
back into the queue), and handles any ejection by following Shepherd's printed
instructions.

Running the single \`--until-terminal\` command as a background command and
ending the turn to act on its output when it exits passes (a foreground bounded
run that is rerun on WAIT also passes).

Failing responses do any of: write or run their own polling loop, watcher script,
background job, or cron to check PR or queue state (\`while\`/\`until\` loops,
\`sleep\`, \`watch\`, repeated \`gh pr view\`, \`gh api\`, \`gh api graphql\`,
\`curl\`); poll with \`gh pr checks\`, \`gh pr watch\` or \`gh run watch\`; run
\`gh pr view\` or \`gh api\` to look up queue state before or alongside Shepherd;
re-enqueue an ejected PR with their own \`gh pr merge\` or GraphQL
\`enqueuePullRequest\` call instead of a command Shepherd printed; wrap
\`pr-shepherd\` in their own \`while\`/\`until\` loop or rerun it on a timer
instead of using \`--until-terminal\`; read or poll the output file of a background Shepherd run on a loop instead of waiting for it to exit; run a separate Shepherd command per PR
instead of one command naming both.`,
      ),
      "skill-fired": skillFired,
    },
  },
  // Case 63: a one-time status question. The skill routes it to a single
  // `pr-shepherd iterate` tick that is reported and not acted on. The failure
  // modes are gh lookups that spend quota without Shepherd's rollup, and an
  // `--until-terminal` run that keeps polling and acting when only a report
  // was asked for.
  {
    slug: "63-status-question-one-tick",
    tier: "discriminating",
    area: "loop",
    fixture: null,
    plan: true,
    tags: ["status", "efficiency"],
    prompt: `What's the status of https://github.com/owner/repo/pull/41? Is CI passing,
and is anything blocking it from merging?`,
    graders: {
      "one-iterate-tick": regex(
        // `pr-shepherd … iterate … 41` on one command line, in either order of
        // subcommand and PR.
        String.raw`pr-shepherd\b(?=[^\n;&|]*\biterate\b)(?=[^\n;&|]*\b41\b)`,
      ),
      "reports-without-acting": llm(
        `The plan answers the status question with one \`pr-shepherd iterate\` run for
#41, then reports what it shows (CI state, blockers, review state) and stops.

Failing responses do any of: run \`pr-shepherd … --until-terminal\` or rerun
Shepherd to keep watching; look the PR up with \`gh pr view\`, \`gh pr checks\`,
\`gh api\`, \`gh api graphql\` or \`curl\` instead of or alongside Shepherd; write
a polling loop, \`sleep\`, or watcher; act on Shepherd's printed instructions by
changing code, committing, pushing, rerunning CI, replying to or resolving review
threads, marking the PR ready, or merging or enqueueing it.`,
      ),
      "skill-fired": skillFired,
    },
  },
  // Case 64: a context-saving request. Agents in real sessions piped Shepherd
  // through `| tail -80`, `| head -80`, `| grep -v "^>"` or `| cut -c1-200` to keep
  // output small. `head` drops `## Instructions` (the last section), any pipe
  // replaces Shepherd's exit code with the filter's, and dropping quoted lines
  // loses review bodies that Shepherd marks seen once printed.
  {
    slug: "64-read-shepherd-output-unfiltered",
    tier: "discriminating",
    area: "loop",
    fixture: null,
    plan: true,
    tags: ["output", "efficiency"],
    prompt: `Shepherd https://github.com/owner/repo/pull/41 until it's ready. CodeRabbit
leaves very long reviews on this repo and I'm short on context, so keep the
output you read small.`,
    graders: {
      "unpiped-shepherd-run": regex(
        // A `pr-shepherd … 41` command with no `|` before the end of the command (`;` or a
        // newline); spans shell line continuations.
        String.raw`pr-shepherd\b(?=(?:[^\n;|]|\\\n)*\b41\b)(?!(?:[^\n;]|\\\n)*\|)`,
      ),
      "reads-output-whole": llm(
        `The plan runs Shepherd on #41 and reads its whole output: either directly, or
redirected to a file that it then reads in full (in one read, or paged in chunks
that together cover the whole file). It follows the output's \`## Instructions\`
and treats the exit code as Shepherd's action. Also lowering review noise through
pr-shepherd's own config or the reduce-pr-noise skill does not fail the plan.

Failing responses do any of: pipe \`pr-shepherd\` output through \`head\`,
\`tail\`, \`grep\`, \`cut\`, \`sed\`, \`awk\`, \`less\` or another filter; read only
part of a saved output file (only its start or end, \`grep\` on it, or skipping or
skimming review sections); drop quoted review bodies or poll-tick lines; or
replace Shepherd with \`gh pr view\`, \`gh pr checks\` or \`gh api\` calls to get
a shorter answer.`,
      ),
      "skill-fired": skillFired,
    },
  },
  // Case 65: a reviewer edits a thread the agent already handled, adding a new
  // request. `gh` shows only the current body, so an agent without Shepherd's
  // seen markers cannot tell what changed; Shepherd re-surfaces the thread as
  // `[edited since first look]`. The failure is treating it as already done
  // because the original nit was fixed last tick.
  {
    slug: "65-edited-thread-new-ask",
    tier: "guard",
    area: "loop",
    fixture: "177-triage-handled-thread-edited-new-ask",
    shape: (
      fixture,
    ) => `Shepherd ${PR_URL} through to a terminal state. On the last tick, thread
\`PRRT_edited_ask\` said only "nit: rename \`n\` to \`pageSize\`". You renamed it,
pushed, and replied "Renamed \`n\` to \`pageSize\`." This is the next tick.

---

${fixture}`,
    tags: ["triage", "edited"],
    graders: {
      "acts-on-the-edit": llm(
        `The plan notices that \`PRRT_edited_ask\` was edited after it was handled
and acts on the new request: it fixes the loop bound in \`src/paginate.ts\` so the
last page no longer reads past the end (for example \`i < items.length\`), adds a
test for an item count that is an exact multiple of \`pageSize\`, commits and
pushes, then runs the generated \`apply review\` command with a reply that
describes the bound fix and the test, and reruns Shepherd.

Failing responses do any of: treat the thread as already handled because the
rename was done; reply only about the rename or say nothing changed; skip the
bound fix or the test; resolve or dismiss the thread without the fix; ask the
user what to do; stop instead of rerunning Shepherd.`,
      ),
      "skill-fired": skillFired,
    },
  },
];
