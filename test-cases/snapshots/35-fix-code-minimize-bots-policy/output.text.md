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

## Post-fix push

- base: `main`
- resolve-only: `pr-shepherd apply review 42 --minimize-comment-ids PRR_bot1`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_main --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Actionable comments` and decide whether it needs a code change.
2. Review each body under `## Review summaries (first look)`. Eligible non-human IDs are already in `--minimize-comment-ids`. Record any warranted Shepherd Journal note before review mutations.
3. Apply every warranted review fix in each file referenced above.
4. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
5. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
6. Link threads and comments from their headings. Cite reviews by ID.
7. Run the `resolve-only:` command shown above.
8. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
9. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
10. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
11. Run the `apply review:` command shown above.
12. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
