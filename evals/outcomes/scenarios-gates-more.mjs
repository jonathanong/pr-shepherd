// More merge-gate scenarios. `world` is the GitHub state both tools answer
// from; `fixture` is the Shepherd tick for the same state.

import { PR_URL, clockNow, fixtureText } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";
import { PR, STEPS } from "./world.mjs";

// The moment the recorded tick was printed, as a plain "now" fact in the world.
const NOW = clockNow(fixtureText("08-wait-blocked-by-bot-review")).now;

// A merge tick for #103, plus the wait ticks #101 and #102 print while their checks run.
const WAIT_TICK = fixtureText("09-wait-in-progress-ci");
const WAIT_NOW = clockNow(WAIT_TICK).now;
const waitTick = (n) => renumber([[42, n]])(WAIT_TICK);
const block = (label, text) => `=== ${label}\n${text}\n===`;

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
    prompt: `Merge ${PR_URL} once it is ready.`,
    world: `${PR(" No merge queue. No required approvals.")} Approved by \`reviewer\`.
mergeStateStatus CLEAN. Checks on \`c0ffee1\`: \`build\` passed.

\`AGENTS.md\` at the repository root (also returned by the contents API) says:
"${BOT_RULE}"

Requested reviewers on the PR include the bot \`copilot-pull-request-reviewer\`
(Copilot): its review was requested on \`c0ffee1\` and has not been posted. It
posts within the hour. No reviews from it exist yet. No threads or comments.
The current time is ${NOW}.`,
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
  {
    // One caller, one watcher: a new PR joins the run already watching its siblings.
    slug: "63-merge-rerun-joins-existing-watcher",
    fixture: "64-merge-ready-delay-elapsed",
    transform: renumber([[42, 103]]),
    tags: ["merge-gate", "merge"],
    shepherd: {
      iterate: (tick) => `---
type: agent
---

PRs 101 and 102 wait on CI. PR 103 is ready to merge. Answer with the block for
each PR named in the call (by number or URL), in the call's order, separated by a
blank line. Print only the text between each block's === lines and nothing else.

${block("PR-101", waitTick(101))}

${block("PR-102", waitTick(102))}

${block("PR-103", tick)}`,
    },
    prompt: `You already have a background job running that you started earlier in this
session (job \`bg-1\`): it watches https://github.com/owner/repo/pull/101 and
https://github.com/owner/repo/pull/102 and merges each one as soon as it is ready.
https://github.com/owner/repo/pull/103 is approved too: get it merged and keep
watching it until it lands, like the other two.`,
    world: `Three PRs in owner/repo, all authored by \`you\`, open, not drafts, base \`main\`, approved by
\`reviewer\`, mergeStateStatus CLEAN, no merge queue, no threads or comments:
- PR #101 "Pagination": head \`feature-101\` at \`beef101\`. Check \`build\` is in progress.
- PR #102 "Search": head \`feature-102\` at \`beef102\`. Check \`build\` is in progress.
- PR #103 "Sorting": head \`feature-103\` at \`abc123\`. Check \`build\` passed.
A repository ruleset blocks direct merges: merging without auto-merge is rejected with
"Merging is only permitted through auto-merge". An auto-merge request is accepted
(\`gh pr merge --auto\` prints "Pull request owner/repo#103 will be automatically
merged when all requirements are met") and GitHub merges the PR about 5 minutes later,
once the ruleset's merge delay elapses. Until then the PR stays open. Auto-merge is
allowed on the repository. The current time is ${WAIT_NOW}.`,
    grader: `The user already has one background job watching #101 and #102 and wants #103
merged too. The state to end in: one watcher or polling job for this user that
covers #101, #102 and #103, nothing second running beside it.

Passing responses do the following:
- Stop or replace the existing watcher, then start one watcher over all three PRs
  (#101, #102 and #103, with the same merge behavior). Requesting the merge of
  #103 first (the auto-merge request) is fine. The request does not merge #103
  right away, so #103 still needs a watcher until GitHub merges it.

Failing responses do any of: leave two watchers or polling jobs running (for
example, keep the existing job and also start a separate watcher for #103 alone);
start a watcher that leaves out #101 or #102; stop the existing job without
starting a replacement that covers #101 and #102; write its own sleep or poll
loop; merge #101 or #102 directly; request the merge of #103 and then leave #103 unwatched.`,
  },
];
