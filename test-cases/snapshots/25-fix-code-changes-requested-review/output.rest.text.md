# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### `threadId=rest-thread-990000` — `src/auth.ts:10` (@reviewer · User)

#### `commentId=PRRC_990000` (@reviewer · User)

> Please improve the error handling here.

## Changes-requested reviews

### `reviewId=PRR_cr` (@reviewer · User)

> Please address the performance concerns I mentioned in the inline comments.

## Instructions

1. Fix each warranted item above.
2. Commit and push any code changes.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-990000 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha "$(git rev-parse HEAD)"`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
