// Cases 58-61: states that had a fixture or a printed rule but no eval case.
//
//   - 58/59 a failing check recorded as blocked by another PR (`apply check-blocker`,
//     #463): WAIT while the blocker is open, then update the branch (never rerun)
//     once it merged.
//   - 60 classification auto-resolve (#471): Shepherd already resolved and
//     minimized the bot notices, so the agent must not redo them.
//   - 61 a merge-queued stack under `--merge`: the stack stays non-terminal.

import {
  ITERATES_STACK_AGAIN,
  RERUNS_ON_WAKE,
  ITERATES_AGAIN,
  llm,
  regex,
  shapeA,
  skillFired,
  stackShape,
} from "../lib.mjs";

const NO_GH_POLL = `It does not poll with \`gh pr checks\`, \`gh pr watch\` or \`gh run watch\`.`;

const aggregateShape = (fixture) => `Shepherd PRs #42 and #43 through to a terminal state.
I already ran \`pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal\`
and it returned this summary. Take it from there.

---

${fixture}`;

export const BLOCKER_CASES = [
  {
    slug: "58-check-blocked-by-open-pr-waits",
    tier: "discriminating",
    area: "github",
    runs: 6,
    fixture: "175-wait-check-blocked-by-open-pr",
    shape: shapeA,
    tags: ["wait", "check-blocker", "ci-triage"],
    graders: {
      "does-not-chase-the-blocked-check": llm(
        `The status line says \`FAILING\`, but the \`[WAIT]\` log says the only failing check
is "blocked by owner/repo#99". The plan does not try to fix, investigate or rerun
that check.

Passing responses take the WAIT as printed. Noting that the check is blocked by
#99 is fine.

Failing responses do any of: rerun the failing job (\`gh run rerun\`); read its
logs or edit code to fix it; open or comment on #99; clear or change the recorded
blocker; escalate to a human; poll with \`gh pr checks\`, \`gh pr watch\` or
\`gh run watch\`.`,
      ),
      "reruns-on-wake": llm(RERUNS_ON_WAKE),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "59-check-blocker-released-updates-branch",
    tier: "discriminating",
    area: "github",
    runs: 6,
    fixture: "176-triage-check-blocker-released",
    shape: shapeA,
    tags: ["triage", "check-blocker", "ci-triage"],
    graders: {
      "updates-the-branch": regex(String.raw`update-branch\s+(?:\S*/)?42\b`),
      "does-not-rerun-the-job": llm(
        `The blocker for the failing check merged, and the output says to update the branch
from its base and "Do not rerun the job; a rerun retests the old merge ref." The
plan does not rerun the Benchmarks job.

Passing responses update the branch as printed (or by the repository's own
procedure) and let the new head's checks run. Saying explicitly that a rerun is
declined passes.

Failing responses do any of: run \`gh run rerun\` or re-request the check; plan a
rerun "to confirm", before or after the update; patch benchmark code to fix a
failure the merged blocker already explains.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "60-aggregate-rule-auto-resolved-not-redone",
    tier: "discriminating",
    area: "loop",
    runs: 6,
    fixture: "170-aggregate-explicit-rule-auto-resolve",
    shape: aggregateShape,
    tags: ["multi-pr", "aggregate", "auto-resolve", "triage"],
    graders: {
      "runs-the-triage-row-poll-command": regex(
        String.raw`pr-shepherd\s+https://github\.com/owner/repo/pull/43\s+--until-terminal`,
      ),
      "does-not-redo-the-auto-resolve": llm(
        `Under #42 the summary says Shepherd already auto-resolved thread \`PRRT_notice\` and
minimized \`IC_progress\` and \`PRR_activity\`; #42 is a \`[WAIT]\` row. The plan
treats that as done: it does not resolve, minimize, reply to or re-read those
items, and does not start a session for #42.

Failing responses do any of: resolve or minimize any of those IDs again (with
\`apply review\`, \`gh api\` or the web UI); open #42 to check what was resolved;
start a one-PR session for #42; hand-minimize #43's \`IC_stuck\` outside the one-PR
session that #43's \`pollCommand\` starts.
${NO_GH_POLL}`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "61-stack-merge-queued-stays-non-terminal",
    tier: "discriminating",
    area: "github",
    runs: 6,
    fixture: "98-aggregate-stack-merge-queue",
    shape: stackShape("https://github.com/owner/repo/pull/352", { merge: true }),
    tags: ["stack", "wait", "merge-queue"],
    graders: {
      "leaves-the-queued-stack-alone": llm(
        `Both layers are in the merge queue and READY receipts exist. The plan does not
touch them: no rebase, amend or push, no \`gh stack merge\` or \`gh pr merge\`, no
dequeue or re-enqueue, and no new one-PR sessions.

The output says "Do not rewrite a queued layer". An upper layer's READY receipt
does not mean the handoff is complete.

Failing responses do any of: merge, enqueue or dequeue any layer; push to either
branch; declare the stack finished or merged; block on a watcher such as
\`gh pr checks --watch\`.`,
      ),
      "iterates-the-stack": llm(ITERATES_STACK_AGAIN),
      "skill-fired": skillFired,
    },
  },
];
