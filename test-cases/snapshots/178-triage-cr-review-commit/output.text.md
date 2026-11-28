# PR #42 [TRIAGE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED`

## Changes-requested reviews

### `reviewId=PRR_older_commit` (@claude · Bot) [reviewed `1234567`, head `def5678`, 2 commits since]

> Please validate the amount before charging.

### `reviewId=PRR_on_head` (@claude · Bot)

> Please add a lock around the job counter.

## Instructions

1. Fix each warranted item.
2. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <reason>'`.
3. Commit and push any changes to the PR head.
4. `$CHANGE_MESSAGE`: one sentence on what changed. Run even if no code changed to dismiss and hide resolved reviews: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --minimize-comment-ids PRR_older_commit,PRR_on_head --dismiss-review-ids PRR_older_commit,PRR_on_head --message "$CHANGE_MESSAGE" --require-sha HEAD`
5. Rerun Shepherd now.
