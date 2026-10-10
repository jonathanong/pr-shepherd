# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_human_1](https://github.com/owner/repo/pull/42#discussion_r1) — `src/handler.mts:55` (@alice · User)

#### [commentId=IC_human_1](https://github.com/owner/repo/pull/42#discussion_r1) (@alice · User)

> Can you also add a retry here?

## Changes-requested reviews

### `reviewId=PRR_bot_cr_2` (@claude · Bot)

> ## Blockers
>
> 1. **Unchecked error.** `src/handler.mts:55` ignores the return value of `writeFile`. Add error handling.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_human_1 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_cr_2 --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Read every body under `## Changes-requested reviews` and apply any warranted change.
4. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
5. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
6. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
7. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
8. Run the `apply review:` command above with every printed ID, even if you changed no code.
9. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
