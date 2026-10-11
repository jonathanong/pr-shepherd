# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Changes-requested reviews

### `reviewId=PRR_bot_cr` (@claude · Bot)

> ## Summary
>
> Here are some blockers I found:
>
> 1. **Missing input validation.** The `processPayment` function at `src/payments.mts:42` does not validate the amount field before passing it to the charge API.
> 2. **Race condition.** `src/queue.mts:88` reads and writes the job counter without a lock.

## Instructions

1. Fix each warranted item.
2. Commit and push any changes.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_cr --require-sha HEAD`
5. Rerun this command now.
