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

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_conversation --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
5. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
6. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
7. Run the `apply review:` command above with every printed ID, even if you changed no code.
8. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
