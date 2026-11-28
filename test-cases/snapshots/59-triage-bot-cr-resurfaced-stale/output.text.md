# PR #42 [TRIAGE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED`

## Changes-requested reviews

- `reviewId=PRR_bot_stale` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

## Instructions

1. Fix each warranted item.
2. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <reason>'`.
3. Commit and push any changes to the PR head.
4. `$CHANGE_MESSAGE`: one sentence on what changed. Run even if no code changed to dismiss and hide resolved reviews: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --minimize-comment-ids PRR_bot_stale --dismiss-review-ids PRR_bot_stale --message "$CHANGE_MESSAGE" --require-sha HEAD`
5. Rerun Shepherd now.
