# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### `threadId=PRRT_thread1` — `src/auth.ts:10` (@reviewer · User)

> Please fix this.

## Changes-requested reviews

- `reviewId=PRR_overlap` (@reviewer · User)

## Review summaries (first look)

### `reviewId=PRR_overlap` (@reviewer · User)

> Please refactor the auth module.

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_thread1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Review each body under `## Review summaries (first look)`. Eligible non-human IDs are already in `--minimize-comment-ids`. Record any warranted Shepherd Journal note before review mutations.
3. Apply every warranted review fix in each file referenced above.
4. Read every body under `## Changes-requested reviews` and apply any warranted change.
5. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
7. Link threads and comments from their headings. Cite reviews by ID.
8. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
9. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
10. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
11. Run the `apply review:` command shown above.
12. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll: run the default `pr-shepherd` command again, or call MCP `iterate` again. Stop only on `[CANCEL]`, `[ESCALATE]`, or human direction.
