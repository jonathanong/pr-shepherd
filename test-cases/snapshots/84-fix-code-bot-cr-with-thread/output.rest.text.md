# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-10](https://github.com/owner/repo/pull/42#discussion_r10) — `src/auth.ts:88` (@reviewer)

#### [commentId=PRRC_10](https://github.com/owner/repo/pull/42#discussion_r10) (@reviewer)

> This authentication logic is too complex, please simplify.

## Changes-requested reviews

- `reviewId=PRR_bot_overdue_84` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

## Instructions

1. Fix each warranted item.
2. Commit and push any changes.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-10 --message "$DISMISS_MESSAGE" --adopt-existing-replies --dismiss-review-ids PRR_bot_overdue_84 --require-sha HEAD`
5. Rerun Shepherd now.
