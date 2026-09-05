# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### `threadId=PRRT_thread1` — `src/auth.ts:10` (@reviewer · User)

> Please improve the error handling here.

## Changes-requested reviews

### `reviewId=PRR_cr` (@reviewer · User)

> Please address the performance concerns I mentioned in the inline comments.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_thread1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Read every body under `## Changes-requested reviews` and apply any warranted change.
4. If you changed code, commit any remaining changes and push to the PR head branch, then run the remaining review mutations using the pushed commit SHA and iterate immediately with the same options. If you did not change code, do not commit and continue with the remaining steps.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
6. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.
7. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, commit and push to the PR head branch first, then replace `$HEAD_SHA` with the pushed commit SHA.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
10. `[FIX_CODE]` is non-terminal: if you changed code, commit and push to the PR head branch, then run the review mutations using the pushed commit SHA and iterate immediately with the same options; if you did not change code, complete the authorized review mutations and iterate immediately with the same options.
