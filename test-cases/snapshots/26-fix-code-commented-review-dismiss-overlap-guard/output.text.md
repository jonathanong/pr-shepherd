# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing

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
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_thread1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads`, `## Changes-requested reviews` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase, push, then run the `resolve:` command. **If no code changes are needed:** skip cancellation/commit/push and run the `resolve:` command.
2. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
3. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
4. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
5. Before running the `resolve:` command, remove any thread from `--reply-thread-ids` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.
6. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
7. Review the bodies shown under `## Review summaries (first look)` — you are seeing these for the first time. Eligible non-human IDs, when present, are already included in `--minimize-comment-ids` in the resolve or resolve-only command above; if any warrants a Shepherd Journal note, append it before running resolve.
8. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
9. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `pr-shepherd 42` to recheck once after a fresh 30s–4m delay.
