# PR #42 [TRIAGE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED`

## Review threads

### [threadId=PRRT_thrash_84](https://github.com/owner/repo/pull/42#discussion_r10) — `src/auth.ts:88` (@reviewer)

> This authentication logic is too complex, please simplify.

## Changes-requested reviews

- `reviewId=PRR_bot_overdue_84` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

## Instructions

1. Fix each warranted item.
2. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <reason>'`.
3. Commit and push any changes to the PR head.
4. `$CHANGE_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_thrash_84 --message "$CHANGE_MESSAGE" --require-sha HEAD`
5. `$CHANGE_MESSAGE`: one sentence on what changed. Run even if no code changed to dismiss and hide resolved reviews: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --minimize-comment-ids PRR_bot_overdue_84 --dismiss-review-ids PRR_bot_overdue_84 --message "$CHANGE_MESSAGE" --require-sha HEAD`
6. Rerun Shepherd now.
