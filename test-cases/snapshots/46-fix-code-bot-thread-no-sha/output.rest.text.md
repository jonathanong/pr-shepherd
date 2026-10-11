# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-990000](https://github.com/owner/repo/pull/42#discussion_r46_bot) — `src/bot.ts:10` (@copilot-pull-request-reviewer · Bot)

#### [commentId=PRRC_990000](https://github.com/owner/repo/pull/42#discussion_r46_bot) (@copilot-pull-request-reviewer · Bot)

> Bot-only thread — no human threads exist.

## Instructions

1. Fix each warranted item.
2. Commit and push any changes.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-990000 --message "$DISMISS_MESSAGE" --adopt-existing-replies --resolve-thread-ids rest-thread-990000 --require-sha HEAD`
5. Rerun this command now.
