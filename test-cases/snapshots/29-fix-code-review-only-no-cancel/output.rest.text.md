# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **repo** `owner/repo`
**summary** 1 inProgress
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
**activity** 0 commits · 0 review rounds · active: `CI / tests`

## Review threads

### `threadId=rest-thread-990000` — `src/index.ts:5` (@reviewer · User)

#### `commentId=PRRC_990000` (@reviewer · User)

> Please rename this variable.

## Changes-requested reviews

### `reviewId=PRR_changes_only` (@reviewer · User)

> High-level design issue — please discuss in a follow-up PR.

## Instructions

1. Fix each warranted item above.
2. Commit and push any code changes.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-990000 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha "$(git rev-parse HEAD)"`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
