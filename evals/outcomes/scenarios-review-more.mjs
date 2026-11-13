// More review-feedback scenarios. `world` is the GitHub state both tools answer
// from; `fixture` is the Shepherd tick for the same state.

import { PR_URL } from "../lib.mjs";
import { PR, STEPS } from "./world.mjs";

const RULES = " No merge queue. Branch protection on `main`: conversations must be resolved before merge.";

const SUGGEST_RESULT = JSON.stringify(
  {
    pr: 42,
    repo: "owner/repo",
    patches: [
      {
        threadId: "PRRT_suggest",
        path: "src/parser.ts",
        startLine: 15,
        endLine: 15,
        author: "reviewer",
        patch:
          "--- a/src/parser.ts\n+++ b/src/parser.ts\n@@ -15,1 +15,1 @@\n-let MAX_RETRIES = 3;\n+const MAX_RETRIES = 3;\n",
        commitMessage: "Use a constant for MAX_RETRIES",
        commitBody: "Co-authored-by: reviewer <reviewer@users.noreply.github.com>",
        filesToStage: ["src/parser.ts"],
      },
    ],
    postActionInstructions: [
      "Apply the patch for src/parser.ts with `git apply`.",
      "Stage the files: `git add src/parser.ts`.",
      'Commit: `git commit -m "Use a constant for MAX_RETRIES" -m "Co-authored-by: reviewer <reviewer@users.noreply.github.com>"`.',
      "Push the commit to the PR head branch; Shepherd does not recommend a push for you.",
      "Run the authorization-checked `apply review` command for PRRT_suggest from the pushed checkout.",
    ],
  },
  null,
  2,
);

export const REVIEW_MORE_SCENARIOS = [
  {
    // Four kinds of work at once; a human's changes-requested review among them.
    slug: "11-multi-category",
    fixture: "54-triage-multi-category-threads-comments-checks-changes",
    // The excerpt carries the same log the world's job does.
    transform: (t) =>
      t.replace(
        "  > Run tests\n",
        [
          "Run tests",
          "FAIL tests/flags.test.ts > parses --page-size",
          "AssertionError: expected '25' to be 25 // Object.is equality",
          "❯ tests/flags.test.ts:12:31",
          "Tests  1 failed | 41 passed (42)",
          "##[error]Process completed with exit code 1.",
        ]
          .map((l) => `  > ${l}\n`)
          .join(""),
      ),
    tags: ["review", "ci"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(RULES, "`src/index.ts`, `src/flags.ts`, `tests/flags.test.ts`")}
mergeStateStatus BLOCKED, reviewDecision CHANGES_REQUESTED.

- Review thread (GraphQL id \`PRRT_multi\`), unresolved, on \`src/index.ts\` line 30,
  by \`reviewer\` (MEMBER): "Extract this into a helper." Lines 30-38 parse the new
  \`--page-size\` flag inline inside \`main()\`.
- Issue comment id 54 (node \`IC_multi\`) by \`reviewer\`: "Mention the new flag in
  the README." The README does not mention \`--page-size\`.
- Workflow "CI", run 5401 on \`c0ffee1\`: job \`tests\` (required) failed in step
  "Run tests". Log:
    FAIL tests/flags.test.ts > parses --page-size
    AssertionError: expected '25' to be 25 // Object.is equality
    ❯ tests/flags.test.ts:12:31
    Tests  1 failed | 41 passed (42)
    ##[error]Process completed with exit code 1.
- Review id 5400 (node \`PRR_multi_cr\`) by \`reviewer\` (a human, MEMBER),
  CHANGES_REQUESTED on \`c0ffee1\`: "Blocking until the failing test and the
  inline notes are addressed."`,
    grader: `The agent handles all four items: extracts the flag parsing at
\`src/index.ts:30\` into a helper, documents \`--page-size\` in the README, fixes
the failing test's cause in code (the flag value is a string, not a number)
rather than rerunning, commits and pushes, and replies on the thread. It leaves
the human reviewer's changes-requested review in place: re-requesting their
review, or telling the user it needs their re-review, is correct.

${STEPS}

Failing responses do any of: drop one of the four items; dismiss the human's
changes-requested review; rerun CI instead of fixing the test; ask the user
what to do.`,
  },
  {
    // A human thread and a stale bot changes-requested review together.
    slug: "12-bot-review-and-thread",
    fixture: "84-triage-bot-cr-with-thread",
    // The fixture is a later tick that lists the review without its body; show
    // the body, as the first tick did.
    transform: (t) =>
      t.replace(
        "- `reviewId=PRR_bot_overdue_84` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]",
        "### `reviewId=PRR_bot_overdue_84` (@claude · Bot)\n\n> `validateToken` (`src/auth.ts:42`) never checks token expiry.",
      ),
    tags: ["review", "bot"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(RULES, "`src/auth.ts`")} mergeStateStatus BLOCKED,
reviewDecision CHANGES_REQUESTED. Checks on \`c0ffee1\`: \`build\` passed.

- Review thread (GraphQL id \`PRRT_thrash_84\`), unresolved, on \`src/auth.ts\` line
  88, by \`reviewer\`: "This authentication logic is too complex, please
  simplify." Lines 88-120 are four nested \`if\` blocks checking the token, the
  session and the role.
- Review id 8401 (node \`PRR_bot_overdue_84\`) by \`claude[bot]\` (a GitHub App
  bot), CHANGES_REQUESTED, submitted 2026-11-08 on older commit \`a1b2c3d\`:
  "\`validateToken\` (\`src/auth.ts:42\`) never checks token expiry." The next
  commit, \`c0ffee1\` "Check token expiry in validateToken", added that check.
  The bot has not reviewed since.`,
    grader: `The agent simplifies the logic at \`src/auth.ts:88\`, commits and pushes, replies
on that thread, and dismisses the bot's stale changes-requested review itself
(any mechanism counts) with a truthful message about what changed. Citing
\`c0ffee1\`'s expiry check is not required.

${STEPS}

Failing responses do any of: leave the bot review blocking; wait for the bot to
re-review; ask a human to dismiss or approve; skip the thread.`,
  },
  {
    // A reviewer's GitHub suggestion block.
    slug: "13-suggestion",
    fixture: "18-triage-review-thread-suggestion",
    tags: ["review", "suggestion"],
    shepherd: { suggest: SUGGEST_RESULT },
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(RULES, "`src/parser.ts`")} Checks on \`c0ffee1\`: \`build\` passed.

Review thread (GraphQL id \`PRRT_suggest\`), unresolved, on \`src/parser.ts\` line 15,
by \`reviewer\`. Body:
  Use a constant here:
  \`\`\`suggestion
  const MAX_RETRIES = 3;
  \`\`\`
Line 15 currently reads \`let MAX_RETRIES = 3;\`, and nothing reassigns it.`,
    grader: `The agent applies the reviewer's suggestion exactly (line 15 becomes
\`const MAX_RETRIES = 3;\`), commits and pushes it to the PR branch, and replies on
the thread. Crediting the reviewer as co-author is fine.

${STEPS}

Failing responses do any of: change something other than the suggested line;
skip the commit, the push or the reply; ask the user to click "Commit
suggestion" instead of doing it.`,
  },
];
