# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED`

## Changes-requested reviews

- `reviewId=PRR_bot_overdue` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

### `reviewId=PRR_bot_new` (@claude · Bot)

> A newer changes-requested review that must be displayed before its retained dismissal runs.

## Instructions

1. Fix each warranted item.
2. Commit and push any changes.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
4. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_overdue,PRR_bot_new --require-sha HEAD`
5. Rerun this command now.
