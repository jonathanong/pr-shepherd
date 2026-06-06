# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Review threads

### [threadId=PRRT_human_1](https://github.com/owner/repo/pull/42#discussion_r1) — `src/handler.mts:55` (@alice · User)

#### [commentId=IC_human_1](https://github.com/owner/repo/pull/42#discussion_r1) (@alice · User)

> Can you also add a retry here?

## Changes-requested reviews

- `reviewId=PRR_bot_cr_2` (@claude · Bot)

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_human_1 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_cr_2 --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads`, `## Changes-requested reviews` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push, then run the `resolve:` command. **If no code changes are needed:** skip the commit/push and run the `resolve:` command.
2. Apply code fixes: read and edit each file referenced under `## Review threads` above.
3. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes. Bot/non-human CR reviews listed in `--dismiss-review-ids` will be dismissed by the `resolve:` command after your push.
4. Before running the `resolve:` command, remove any thread from `--reply-thread-ids` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.
5. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
6. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
7. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
