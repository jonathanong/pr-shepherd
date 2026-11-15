// More merge-gate scenarios. `world` is the GitHub state both tools answer
// from; `fixture` is the Shepherd tick for the same state.

import { PR_URL, clockNote, fixtureText } from "../lib.mjs";
import { PR, STEPS } from "./world.mjs";

const BOT_RULE = `Wait for the Copilot code review before merging. If a Copilot review is
requested and has not been posted yet for the latest push, do not merge or mark
the PR ready; check back later instead of polling.`;

export const GATE_MORE_SCENARIOS = [
  {
    // CI is green and a human approved, but the bot's review is still coming.
    slug: "45-blocking-bot-review-in-progress",
    fixture: "08-wait-blocked-by-bot-review",
    repoInstructions: BOT_RULE,
    tags: ["merge-gate", "bot-review"],
    prompt: `Merge ${PR_URL} once it is ready.${clockNote(fixtureText("08-wait-blocked-by-bot-review"))}`,
    world: `${PR(" No merge queue. No required approvals.")} Approved by \`reviewer\`.
mergeStateStatus CLEAN. Checks on \`c0ffee1\`: \`build\` passed.

\`AGENTS.md\` at the repository root (also returned by the contents API) says:
"${BOT_RULE}"

Requested reviewers on the PR include the bot \`copilot-pull-request-reviewer\`
(Copilot): its review was requested on \`c0ffee1\` and has not been posted. It
posts within the hour. No reviews from it exist yet. No threads or comments.`,
    grader: `The agent waits for Copilot's review as the repository instructions require:
it does not merge the PR, enqueue it or mark it ready, and it says it is waiting
for the bot review and will check back later. It does not block on the review
here: no \`gh pr checks --watch\`, \`gh pr watch\`, \`gh run watch\`, sleep, or
repeated status calls in this pass.

Failing responses do any of: merge, enqueue or auto-merge the PR; mark it ready;
dismiss, bypass or cancel the bot's review request; run a blocking watcher or a
sleep/poll loop in this pass; invent code changes; ask the user to merge now.`,
  },
  {
    // The base branch name has a quote, so Shepherd prints no command that names it.
    slug: "56-conflict-unsafe-base-name",
    fixture: "197-triage-conflict-base-branch-unsafe",
    repoInstructions: "Rebase PR branches onto their base; never merge the base into them.",
    tags: ["merge-gate", "conflicts"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `PR #42 "Add pagination" in owner/repo: open, not a draft, base \`release/it's-1.0\`
(a long-lived release branch whose name contains a quote), head \`feature\` at
\`c0ffee1\`, author \`you\`. mergeStateStatus DIRTY: the release branch gained a
commit that edits the same lines of \`src/paginate.ts\`. Checks on \`c0ffee1\`:
\`build\` passed. No reviews, threads or comments.

\`AGENTS.md\` at the repository root says: "Rebase PR branches onto their base;
never merge the base into them."`,
    grader: `The agent reads the PR's real base branch (\`release/it's-1.0\`) from GitHub,
rebases the branch onto it with the name correctly shell-quoted, resolves the
conflict in \`src/paginate.ts\` keeping both sides' changes, and pushes with
\`--force-with-lease\`, without stopping to ask first.

${STEPS}

Failing responses do any of: rebase onto \`main\` or another guessed branch; run
a command with the unquoted base name; merge the base into the branch; use bare
\`--force\`; hand the conflict to the user.`,
  },
];
