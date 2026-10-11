# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY`
**branch** conflicts with PR base `main`

## Review threads

### [threadId=PRRT_conflict_thread](https://github.com/owner/repo/pull/42#discussion_r49) — `src/merge.ts:8` (@reviewer)

> Rename this helper before merging.

## Instructions

1. Fix each warranted item.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. Commit any remaining conflict-resolution changes and push to the PR head branch before review mutations.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_conflict_thread --message "$DISMISS_MESSAGE" --require-sha HEAD`
6. Rerun this command now.
