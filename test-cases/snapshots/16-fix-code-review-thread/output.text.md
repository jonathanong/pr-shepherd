# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **repo** `owner/repo`

## Review threads

### [threadId=PRRT_active](https://github.com/owner/repo/pull/42#discussion_r1) — `src/index.ts:42` (@reviewer · User)

> Please rename this variable to be more descriptive.

## Instructions

1. Fix each warranted item above.
2. Commit and push any code changes.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_active --message "$DISMISS_MESSAGE" --require-sha "$(git rev-parse HEAD)"`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
