// Case 62: a watch request that never names pr-shepherd. Agents asked to "let me
// know when it merges" wrote `until gh pr view … ; sleep` loops, a bespoke
// ejection watcher, and a `while pr-shepherd 5441 …; sleep 60` wrapper instead of
// one `--until-terminal` run. Each loop iteration spends GraphQL quota, and the
// gh loops miss ejections and failing checks that Shepherd reports.

import { llm, regex, skillFired } from "../lib.mjs";

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

Failing responses do any of: write or run their own polling loop, watcher script,
background job, or cron to check PR or queue state (\`while\`/\`until\` loops,
\`sleep\`, \`watch\`, repeated \`gh pr view\`, \`gh api\`, \`gh api graphql\`,
\`curl\`); poll with \`gh pr checks\`, \`gh pr watch\` or \`gh run watch\`; run
\`gh pr view\` or \`gh api\` to look up queue state before or alongside Shepherd;
re-enqueue an ejected PR with their own \`gh pr merge\` or GraphQL
\`enqueuePullRequest\` call instead of a command Shepherd printed; wrap
\`pr-shepherd\` in their own \`while\`/\`until\` loop or rerun it on a timer
instead of using \`--until-terminal\`; run a separate Shepherd command per PR
instead of one command naming both.`,
      ),
      "skill-fired": skillFired,
    },
  },
];
