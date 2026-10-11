# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BEHIND`
**branch** behind PR base `main`

## Review threads

### [threadId=PRRT_behind_hint](https://github.com/owner/repo/pull/42#discussion_r1) — `src/index.ts:42` (@reviewer)

> Please rename this variable to be more descriptive.

## Instructions

1. Fix each warranted item.
2. The branch is behind PR base branch `main`. rebase --force-with-lease before pushing.
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_behind_hint --message "$DISMISS_MESSAGE" --require-sha HEAD`
6. Rerun this command now.
