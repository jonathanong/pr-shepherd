# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

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
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_conversation --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push, then run the `resolve:` command. **If no code changes are needed:** skip the commit/push and run the `resolve:` command.
2. Apply code fixes: read and edit each file referenced under `## Review threads` above.
3. Before running the `resolve:` command, remove any thread from `--reply-thread-ids` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.
4. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
5. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
6. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
