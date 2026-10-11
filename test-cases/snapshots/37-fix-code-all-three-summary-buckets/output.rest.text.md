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

### `threadId=rest-thread-990000` — `src/auth.ts:10` (@reviewer)

#### `commentId=PRRC_990000` (@reviewer)

> Please add a docstring here.

## Review summaries (first look)

### `reviewId=PRR_first` (@alice)

> First-look comment — never seen before.

## Review summaries (edited since first look — already minimized; do not re-minimize)

### `reviewId=PRR_edited` (@bob)

> Updated review comment.

## Instructions

1. Fix each warranted item.
2. Read each body under `## Review summaries (first look)` and journal any warranted note before review mutations.
3. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
4. Commit and push any changes.
5. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
6. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-990000 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`
7. Rerun this command now.
