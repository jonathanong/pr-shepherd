// Cases 54-55: an explicit multi-PR aggregate poll (`pr-shepherd <PR> <PR> --until-terminal`).
//
// Cases 25 and 44 run one one-PR loop per PR. Here the agent ran the aggregate
// command, got a `# Poll summary [ACTIONABLE]`, and has to route each row: run
// the row's exact `pollCommand`, leave WAIT/ESCALATE rows alone, and rerun the
// aggregate command afterwards. The likely failures are stopping after the
// summary, starting a one-PR session for a WAIT row, and polling with `gh`.

import { llm, regex, skillFired } from "../lib.mjs";

const NO_GH_POLL = `It does not poll with \`gh pr checks\`, \`gh pr watch\` or \`gh run watch\`.`;

const aggregateShape = (fixture) => `Shepherd PRs #42 and #43 through to a terminal state.
I already ran \`pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal\`
and it returned this summary. Take it from there.

---

${fixture}`;

export const AGGREGATE_CASES = [
  {
    slug: "54-multi-pr-aggregate-routes-rows",
    tier: "discriminating",
    area: "loop",
    runs: 6,
    fixture: "86-aggregate-explicit-mixed-actions",
    shape: aggregateShape,
    tags: ["multi-pr", "aggregate", "triage", "wait"],
    graders: {
      "runs-the-triage-row-poll-command": regex(
        String.raw`pr-shepherd\s+https://github\.com/owner/repo/pull/42\s+--until-terminal`,
      ),
      "routes-rows-by-poll-command": llm(
        `The summary has a \`[TRIAGE]\` row for #42 with a \`pollCommand\` and a \`[WAIT]\` row
for #43 with none. The plan runs (or delegates to a subagent) exactly
\`pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal\` for #42 and
follows that session's \`## Instructions\`. #43 is a WAIT row, so it does not start a
one-PR session for it.

Failing responses do any of: start a one-PR \`--until-terminal\` session for #43;
fix #42's failing check by hand without running its \`pollCommand\`; alter the
printed command (drop \`--until-terminal\`, add \`--merge\`); mark #43 ready; merge
either PR (the user did not ask for a merge).`,
      ),
      "reruns-the-aggregate-and-keeps-going": llm(
        `The plan does not stop after the summary: it works the #42 row and then plans to
rerun the aggregate command
(the literal \`pr-shepherd <both PR URLs> --until-terminal ...\` command printed in the
summary's instructions) once the selected work completes, so #43 is picked up when its row changes.
${NO_GH_POLL}

Failing responses do any of: report the summary and end the turn; ask the user
whether to continue; wait for #43 by hand or with a sleep loop; poll with
\`gh pr checks\`, \`gh pr watch\` or \`gh run watch\`; treat the summary's
\`[ACTIONABLE]\` heading as the end of the task.`,
      ),
      "skill-fired": skillFired,
    },
  },
  {
    slug: "55-multi-pr-aggregate-escalate-keeps-working",
    tier: "discriminating",
    area: "loop",
    runs: 6,
    fixture: "160-aggregate-explicit-escalate-and-triage",
    shape: aggregateShape,
    tags: ["multi-pr", "aggregate", "escalate", "triage"],
    graders: {
      "runs-the-triage-row-poll-command": regex(
        String.raw`pr-shepherd\s+https://github\.com/owner/repo/pull/43\s+--until-terminal`,
      ),
      "reports-handoff-and-keeps-working": llm(
        `The summary has an \`[ESCALATE]\` row for #42 (\`triage-thrash\`, no \`pollCommand\`)
and a \`[TRIAGE]\` row for #43 with a \`pollCommand\`. Its instructions say "one row's
\`ESCALATE\` does not stop work on other rows."

Passing responses tell the user that #42 needs a human decision (naming
\`triage-thrash\` or equivalent), and still run or delegate exactly
\`pr-shepherd https://github.com/owner/repo/pull/43 --until-terminal\` in the same
turn, then plan to rerun the aggregate command after that work.
${NO_GH_POLL}

Failing responses do any of: stop the whole task or end the turn because #42
escalated; ask the user for permission to continue with #43; skip #43's
\`pollCommand\` and fix its check by hand; keep working #42 (rebase, push, reply)
instead of handing it off; start a one-PR session for #42; merge either PR.`,
      ),
      "reruns-the-aggregate": llm(
        `The plan reruns the aggregate command
(the literal \`pr-shepherd <both PR URLs> --until-terminal ...\` command printed in the
summary's instructions) after #43's selected work completes, rather than treating the escalated row as the
end of the loop.

Failing responses omit the rerun, end by reporting the escalation as the final
result, or poll with \`gh pr checks\`, \`gh pr watch\` or \`gh run watch\`.`,
      ),
      "skill-fired": skillFired,
    },
  },
];
