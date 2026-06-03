# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing

## Review threads

### `threadId=PRRT_thread1` — `src/auth.ts:10` (@reviewer · User)

> Please add a docstring here.

## Review summaries (first look)

### `reviewId=PRR_first` (@alice · User)

> First-look comment — never seen before.

## Review summaries (edited since first look — already minimized; do not re-minimize)

### `reviewId=PRR_edited` (@bob · User)

> Updated review comment.

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_thread1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push, then run the `resolve:` command. **If no code changes are needed:** skip the commit/push and run the `resolve:` command.
2. Apply code fixes: read and edit each file referenced under `## Review threads` above.
3. Before running the `resolve:` command, remove any thread from `--reply-thread-ids` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.
4. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
5. Review the bodies shown under `## Review summaries (first look)` — you are seeing these for the first time. Eligible non-human IDs, when present, are already included in `--minimize-comment-ids` in the resolve or resolve-only command above; if any warrants a Shepherd Journal note, append it before running resolve.
6. Items marked `[edited since first look]`, items under `## Review summaries (edited since first look)`, and any first-look bullet tagged `, edited` were updated by their author after you previously acknowledged them. Read the updated body before deciding whether any matching `## Review threads to resolve` item should be resolved.
7. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
8. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
