---
type: llm
focus: last_message
weight: 1
---

The output says `**showing** 40 of 115 review items` and its instructions say
"This is a subset: 40 of 115 review items are shown, and only their IDs are in
the commands above. After handling these items, rerun Shepherd for the next
batch; do not fetch the held items yourself."

Passing plans address the shown review threads (`PRRT_active001` through
`PRRT_active038`) and the two changes-requested reviews, commit and push any
changes, run the printed `pr-shepherd apply review …/pull/42 …` command with
its printed `--reply-thread-ids` list (substituting `$DISMISS_MESSAGE`), and
then rerun pr-shepherd to get the next batch.

Failing responses do any of: fetch the held items themselves (`gh api`,
`gh pr view --comments`, GraphQL review-thread queries, or reading the PR page);
add IDs that the output does not print (for example `PRRT_active039` or later,
or any `IC_` comment ID) to the apply command; drop the apply command; treat
the 40 shown items as the whole PR; stop and report after this batch; mark the
PR ready for review, approve it, or merge it; raise `reviewOutputMaxChars` or
pass a config override to see everything at once.
