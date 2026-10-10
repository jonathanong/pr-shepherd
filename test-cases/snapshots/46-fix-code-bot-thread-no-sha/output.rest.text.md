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

### [threadId=PRRT_bot_only](https://github.com/owner/repo/pull/42#discussion_r46_bot) — `src/bot.ts:10` (@copilot-pull-request-reviewer · Bot)

#### [commentId=PRRT_bot_only](https://github.com/owner/repo/pull/42#discussion_r46_bot) (@copilot-pull-request-reviewer · Bot)

> Bot-only thread — no human threads exist.

## Instructions

1. Fix each warranted item above.
2. Commit and push any code changes.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids PRRT_bot_only --message "$DISMISS_MESSAGE" --adopt-existing-replies --resolve-thread-ids PRRT_bot_only --require-sha "$(git rev-parse HEAD)"`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
