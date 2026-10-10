# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Changes-requested reviews

### `reviewId=PRR_bot_cr` (@claude · Bot)

> ## Summary
>
> Here are some blockers I found:
>
> 1. **Missing input validation.** The `processPayment` function at `src/payments.mts:42` does not validate the amount field before passing it to the charge API.
> 2. **Race condition.** `src/queue.mts:88` reads and writes the job counter without a lock.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_cr --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Changes-requested reviews` and decide whether it needs a code change.
2. Read every body under `## Changes-requested reviews` and apply any warranted change.
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
5. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
6. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
7. Run the `apply review:` command above with every printed ID, even if you changed no code.
8. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
