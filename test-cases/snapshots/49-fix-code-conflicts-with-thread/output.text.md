# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**branch** conflicts with PR base `main`

## Review threads

### [threadId=PRRT_conflict_thread](https://github.com/owner/repo/pull/42#discussion_r49) — `src/merge.ts:8` (@reviewer · User)

> Rename this helper before merging.

## Instructions

1. Fix each warranted item above.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. Commit any remaining conflict-resolution changes and push to the PR head branch before review mutations.
4. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_conflict_thread --message "$DISMISS_MESSAGE" --require-sha "$(git rev-parse HEAD)"`
6. `[FIX_CODE]` is non-terminal. Rerun the same command now.
