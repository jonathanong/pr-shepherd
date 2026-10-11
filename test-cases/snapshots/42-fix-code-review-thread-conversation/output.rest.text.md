# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **repo** `owner/repo`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-100](https://github.com/owner/repo/pull/42#discussion_r100) — `src/thread-comments.ts:20-24` (@reviewer · User)

#### [commentId=PRRC_conversation_1](https://github.com/owner/repo/pull/42#discussion_r100) (@reviewer · User)

> Initial concern should remain visible.

#### [commentId=PRRC_conversation_2](https://github.com/owner/repo/pull/42#discussion_r101) (@author · User)

> I pushed a partial fix, but I am not sure about the edge case.

#### [commentId=PRRC_conversation_3](https://github.com/owner/repo/pull/42#discussion_r102) (@reviewer · User)

> The edge case still matters; please handle null nodes too.

## Instructions

1. Fix each warranted item above.
2. Commit and push any code changes.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-100 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha "$(git rev-parse HEAD)"`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
