# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Changes-requested reviews

- `reviewId=PRR_bot_stale` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_stale --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Changes-requested reviews` and decide whether it needs a code change.
2. Read every body under `## Changes-requested reviews` and apply any warranted change.
3. Keep every existing `--dismiss-review-ids` ID in `apply review:`. Each is a bot or non-human review that must be dismissed. Omitting one leaves the PR in `CHANGES_REQUESTED`.
4. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
5. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
6. Link threads and comments from their headings. Cite reviews by ID.
7. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command shown above.
10. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
