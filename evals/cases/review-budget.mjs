// Case 53: the per-tick review output budget (`iterate.reviewOutputMaxChars`).
//
// Fixture 152 holds 115 review items against a 3000-character budget, so the
// FIX_CODE output shows 40 of them (two changes-requested reviews and the 38
// oldest active threads) and prints a subset step. The held items are absent
// from the output and from the generated `apply review` IDs. Two failures are
// likely: fetching the rest with `gh api` to "finish the job", and treating the
// subset as the whole PR (stopping, or marking ready once the shown ones are
// handled).

import { ITERATES_AGAIN, llm, regex, shapeA, skillFired } from "../lib.mjs";

export const REVIEW_BUDGET_CASES = [
  {
    slug: "53-fix-code-review-subset",
    tier: "discriminating",
    area: "github",
    runs: 6,
    fixture: "152-fix-code-review-output-capped",
    shape: shapeA,
    tags: ["fix-code", "review-budget"],
    graders: {
      "runs-the-printed-apply-review": regex(
        String.raw`pr-shepherd\s+apply\s+review\s+https://github\.com/owner/repo/pull/42(?![0-9])`,
      ),
      "handles-the-shown-subset-only": llm(
        `The output says \`**showing** 40 of 115 review items\` and its instructions say
"This is a subset: 40 of 115 review items are shown, and only their IDs are in
the commands above. After handling these items, rerun Shepherd for the next
batch; do not fetch the held items yourself."

Passing plans address the shown review threads (\`PRRT_active001\` through
\`PRRT_active038\`) and the two changes-requested reviews, commit and push any
changes, run the printed \`pr-shepherd apply review …/pull/42 …\` command with
its printed \`--reply-thread-ids\` list (substituting \`$DISMISS_MESSAGE\`), and
then rerun pr-shepherd to get the next batch.

Failing responses do any of: fetch the held items themselves (\`gh api\`,
\`gh pr view --comments\`, GraphQL review-thread queries, or reading the PR page);
add IDs that the output does not print (for example \`PRRT_active039\` or later,
or any \`IC_\` comment ID) to the apply command; drop the apply command; treat
the 40 shown items as the whole PR; stop and report after this batch; mark the
PR ready for review, approve it, or merge it; raise \`reviewOutputMaxChars\` or
pass a config override to see everything at once.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },
];
