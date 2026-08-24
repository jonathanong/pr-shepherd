# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_conversation](https://github.com/owner/repo/pull/42#discussion_r100) — `src/thread-comments.ts:20-24` (@reviewer · User)

#### [commentId=PRRC_conversation_1](https://github.com/owner/repo/pull/42#discussion_r100) (@reviewer · User)

> Initial concern should remain visible.

#### [commentId=PRRC_conversation_2](https://github.com/owner/repo/pull/42#discussion_r101) (@author · User)

> I pushed a partial fix, but I am not sure about the edge case.

#### [commentId=PRRC_conversation_3](https://github.com/owner/repo/pull/42#discussion_r102) (@reviewer · User)

> The edge case still matters; please handle null nodes too.

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_conversation --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
4. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
5. Link threads and comments from their headings. Cite reviews by ID.
6. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
7. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command shown above.
10. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll: run the default `pr-shepherd` command again, or call MCP `iterate` again. Stop only on `[CANCEL]`, `[ESCALATE]`, or human direction.
