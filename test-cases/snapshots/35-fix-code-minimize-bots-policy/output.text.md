# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### `threadId=PRRT_main` — `src/api.ts:5` (@alice · User)

> Rename this function for clarity.

## Actionable comments

### [commentId=IC_user_policy](https://github.com/owner/repo/pull/42#issuecomment-35) (@alice · User)

> Please mention this in the changelog.

## Review summaries (first look)

### `reviewId=PRR_bot1` (@dependabot[bot] · Bot)

> Bumped dependency x from 1.0.0 to 1.1.0.

### `reviewId=PRR_user1` (@alice · User)

> LGTM but please add tests.

## Post-fix actions

- base: `main`
- resolve-only: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --minimize-comment-ids PRR_bot1`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_main --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Actionable comments` and decide whether it needs a code change.
2. Read each body under `## Review summaries (first look)` and journal any warranted note before review mutations.
3. Apply every warranted review fix in each file referenced above.
4. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
5. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
6. Run the `resolve-only:` command shown above.
7. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command above with every printed ID, even if you changed no code.
10. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
