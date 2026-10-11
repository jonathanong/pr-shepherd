# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Changes-requested reviews

- `reviewId=PRR_bot_overdue` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

### `reviewId=PRR_bot_new` (@claude · Bot)

> A newer changes-requested review that must be displayed before its retained dismissal runs.

## Instructions

1. Fix each warranted item.
2. Commit and push any changes.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_overdue,PRR_bot_new --require-sha HEAD`
5. Rerun this command now.
