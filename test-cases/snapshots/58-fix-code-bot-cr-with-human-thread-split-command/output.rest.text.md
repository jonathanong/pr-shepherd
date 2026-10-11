# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **repo** `owner/repo`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-1](https://github.com/owner/repo/pull/42#discussion_r1) — `src/handler.mts:55` (@alice · User)

#### [commentId=IC_human_1](https://github.com/owner/repo/pull/42#discussion_r1) (@alice · User)

> Can you also add a retry here?

## Changes-requested reviews

### `reviewId=PRR_bot_cr_2` (@claude · Bot)

> ## Blockers
>
> 1. **Unchecked error.** `src/handler.mts:55` ignores the return value of `writeFile`. Add error handling.

## Instructions

1. Fix each warranted item above.
2. Commit and push any code changes.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-1 --message "$DISMISS_MESSAGE" --adopt-existing-replies --dismiss-review-ids PRR_bot_cr_2 --require-sha "$(git rev-parse HEAD)"`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
