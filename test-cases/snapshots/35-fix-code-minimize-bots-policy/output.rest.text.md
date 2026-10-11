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

### `threadId=PRRT_main` — `src/api.ts:5` (@alice · User)

#### `commentId=PRRT_main` (@alice · User)

> Rename this function for clarity.

## Actionable comments

### [commentId=IC_user_policy](https://github.com/owner/repo/pull/42#issuecomment-35) (@alice · User)

> Please mention this in the changelog.

## Review summaries (first look)

### `reviewId=PRR_bot1` (@dependabot[bot] · Bot)

> Bumped dependency x from 1.0.0 to 1.1.0.

### `reviewId=PRR_user1` (@alice · User)

> LGTM but please add tests.

## Instructions

1. Fix each warranted item above.
2. Read each body under `## Review summaries (first look)` and journal any warranted note before review mutations.
3. Commit and push any code changes.
4. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids PRRT_main --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha "$(git rev-parse HEAD)"`
6. `[FIX_CODE]` is non-terminal. Rerun the same command now.
