# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **repo** `owner/repo`

## Review threads

### [threadId=PRRT_thrash_84](https://github.com/owner/repo/pull/42#discussion_r10) — `src/auth.ts:88` (@reviewer · User)

> This authentication logic is too complex, please simplify.

## Changes-requested reviews

- `reviewId=PRR_bot_overdue_84` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

## Instructions

1. Fix each warranted item above.
2. Commit and push any code changes.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_thrash_84 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_overdue_84 --require-sha "$(git rev-parse HEAD)"`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
