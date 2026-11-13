// Review-feedback scenarios. `world` is the GitHub state both tools answer
// from; `fixture` is the Shepherd tick for the same state.

import { PR_URL } from "../lib.mjs";
import { STEPS } from "./world.mjs";

const PR = `PR #42 "Add pagination" in owner/repo: open, not a draft, base \`main\`, head
\`feature\` at commit \`c0ffee1\`, author \`you\`. No merge queue. Branch protection
on \`main\`: no required approvals, conversations must be resolved before merge.
Changed files: \`src/paginate.ts\`, \`src/index.ts\`, \`tests/paginate.test.ts\`.`;

const BOT_NEW_BODY =
  "Re-reviewed the latest push. The amount validation in `processPayment` (`src/payments.mts:42`) is still missing.";

export const REVIEW_SCENARIOS = [
  {
    // A reviewer silently edits a thread the agent already answered.
    slug: "01-silent-edit",
    fixture: "177-triage-handled-thread-edited-new-ask",
    transform: (t) => t.replace("> Edit: also, this loop", "> Also, this loop"),
    tags: ["review", "edited"],
    prompt: `Keep getting ${PR_URL} ready to merge. On your last pass you renamed \`n\` to
\`pageSize\` in \`src/paginate.ts\` for the reviewer's comment, pushed, and replied.`,
    world: `${PR}

Checks on \`c0ffee1\`: \`build\` passed (workflow CI, run 27400000001).

Review thread (GraphQL id \`PRRT_edited_ask\`), unresolved, not outdated, on
\`src/paginate.ts\` line 18:
- Comment id 7 (node \`PRRC_7\`) by \`reviewer\`, created 2026-11-10T15:02:11Z,
  last edited 2026-11-11T09:40:37Z. Current body:
  "nit: rename \`n\` to \`pageSize\`.

  Also, this loop uses \`i <= items.length\`, so the last page reads one past the
  end and returns \`undefined\`. Please fix the bound and add a test for an exact
  multiple of \`pageSize\`."
  Edit history (GraphQL \`userContentEdits\`): one edit at 2026-11-11T09:40:37Z;
  the body before it was "nit: rename \`n\` to \`pageSize\`."
- Comment id 8 by \`you\`, created 2026-11-10T16:20:03Z, in reply to 7:
  "Renamed \`n\` to \`pageSize\`."

No reviews other than the one holding that thread (state COMMENTED). No other
comments.`,
    grader: `The agent acts on the new request in the review thread on
\`src/paginate.ts:18\`: it fixes the loop bound so the last page no longer reads
past the end (for example \`i < items.length\`), adds a test for an item count
that is an exact multiple of \`pageSize\`, commits and pushes, and replies on that
thread describing the bound fix and the test.

${STEPS}

Failing responses do any of: treat the thread as already handled because the
rename was done; reply only about the rename; skip the bound fix or the test;
resolve the thread without the fix; ask the user what to do.`,
  },
  {
    // Changes-requested reviews from a bot keep the PR blocked until dismissed.
    slug: "02-stale-bot-review",
    fixture: "60-triage-bot-cr-not-dismissed",
    // The fixture is a later tick that lists the overdue review without its
    // body; show the body, as the first tick did.
    transform: (t) =>
      t
        .replace(
          "A newer changes-requested review that must be displayed before its retained dismissal runs.",
          BOT_NEW_BODY,
        )
        .replace(
          "- `reviewId=PRR_bot_overdue` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]",
          [
            "### `reviewId=PRR_bot_overdue` (@claude · Bot)",
            "",
            "> ## Summary",
            ">",
            "> Here are some blockers I found:",
            ">",
            "> 1. **Missing input validation.** The `processPayment` function at",
            "> `src/payments.mts:42` does not validate the amount field before passing it to",
            "> the charge API.",
            "> 2. **Race condition.** `src/queue.mts:88` reads and writes the job counter",
            "> without a lock.",
          ].join("\n"),
        ),
    tags: ["review", "bot"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `PR #42 "Add payments" in owner/repo: open, not a draft, base \`main\`, head
\`feature\` at commit \`c0ffee1\`, author \`you\`. mergeStateStatus BLOCKED,
reviewDecision CHANGES_REQUESTED. No merge queue. No checks are configured.
Changed files: \`src/payments.mts\`, \`src/queue.mts\`.

Reviews (both by \`claude[bot]\`, a GitHub App bot, author association NONE):
- Review id 9001 (node \`PRR_bot_overdue\`), CHANGES_REQUESTED, submitted
  2026-11-08T10:14:52Z on commit \`a1b2c3d\`. Body:
  "## Summary

  Here are some blockers I found:

  1. **Missing input validation.** The \`processPayment\` function at
  \`src/payments.mts:42\` does not validate the amount field before passing it to
  the charge API.
  2. **Race condition.** \`src/queue.mts:88\` reads and writes the job counter
  without a lock."
- Review id 9002 (node \`PRR_bot_new\`), CHANGES_REQUESTED, submitted
  2026-11-11T08:02:30Z on commit \`c0ffee1\`. Body: "${BOT_NEW_BODY}"

No review threads, no other comments.`,
    grader: `The agent evaluates both changes-requested reviews from the \`claude\` bot,
makes the warranted code fixes and pushes them, then dismisses BOTH bot reviews
itself (any mechanism counts: a GitHub API dismissal, a gh command, the GitHub
MCP server, or a review tool) with a truthful message about what changed, so the
bot's changes-requested state stops blocking the PR.

${STEPS}

Failing responses do any of: dismiss only one review; wait for the bot to
re-review on its own; ask a human to dismiss or approve; stop after pushing.`,
  },
  {
    // Control: a plain open review thread.
    slug: "03-plain-thread",
    fixture: "16-triage-review-thread",
    tags: ["review", "control"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR}

Checks on \`c0ffee1\`: \`build\` passed (workflow CI, run 27400000002).

Review thread (GraphQL id \`PRRT_active\`), unresolved, not outdated, on
\`src/index.ts\` line 42:
- Comment id 1 by \`reviewer\`, created 2026-11-10T15:02:11Z, never edited:
  "Please rename this variable to be more descriptive."

The variable on that line is \`const d = Date.now() - start;\`. No other reviews,
threads or comments.`,
    grader: `The agent commits to renaming the variable at \`src/index.ts:42\` to a more
descriptive name, commits and pushes, and replies on that review thread saying
what changed. The agent may not have seen the code, so naming the new identifier
is optional. Resolving the thread after replying is fine. The user asked for
"ready to merge", not a merge: not merging, or merging only after re-checking,
is fine either way.

${STEPS}

Failing responses do any of: skip the rename, the push, or the reply; ask the
user what to do.`,
  },
];
