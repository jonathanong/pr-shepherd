# PR #42 [ESCALATE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `bot-cr-not-dismissed`

Bot CHANGES_REQUESTED review(s) remained undismissed past the stall window (review IDs: PRR_bot_overdue_84). The agent likely dropped `--dismiss-review-ids` from a prior apply command. Dismiss the review(s) manually (or re-run `pr-shepherd apply review` with the IDs) to unblock the PR.

## Items needing attention

- thread `PRRT_thrash_84` — `src/auth.ts:88` (@reviewer · User):

  > This authentication logic is too complex, please simplify.

- review `PRR_bot_overdue_84` (@claude · Bot):

  > ## Summary
  > 
  > Here are some blockers I found:
  > 
  > 1. **Missing input validation.** The `processPayment` function at `src/payments.mts:42` does not validate the amount field before passing it to the charge API.


## Pending review commands

- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_thrash_84 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_overdue_84 --require-sha "$HEAD_SHA"`

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume.
2. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked thread that is still being resolved is emitted resolve-only, not for another reply.
3. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, commit and push to the PR head branch first, then replace `$HEAD_SHA` with the pushed commit SHA.
4. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
5. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
6. After completing the human-directed recovery and any pending review commands, rerun the Shepherd command with the same options.
