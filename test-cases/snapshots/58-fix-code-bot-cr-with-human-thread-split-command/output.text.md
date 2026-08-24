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

- `reviewId=PRR_bot_cr_2` (@claude · Bot)

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_human_1 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_cr_2 --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Read every body under `## Changes-requested reviews` and apply any warranted change.
4. Keep every existing `--dismiss-review-ids` ID in `apply review:`. Each is a bot or non-human review that must be dismissed. Omitting one leaves the PR in `CHANGES_REQUESTED`.
5. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
7. Link threads and comments from their headings. Cite reviews by ID.
8. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
9. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
10. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
11. Run the `apply review:` command shown above.
12. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll: run the default `pr-shepherd` command again, or call MCP `iterate` again. Stop only on `[CANCEL]`, `[ESCALATE]`, or human direction.
