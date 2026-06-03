# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress
**activity** 0 commits · 0 review rounds · active: `CI / tests`

## Review threads

### `threadId=PRRT_inline1` — `src/index.ts:5` (@reviewer · User)

> Please rename this variable.

## Changes-requested reviews

- `reviewId=PRR_changes_only` (@reviewer · User)

## In-progress runs

- `777`

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_inline1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads`, `## Changes-requested reviews` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push, then run the `resolve:` command. **If no code changes are needed:** skip the commit/push and run the `resolve:` command.
2. If you decide to push new commits: cancel each in-progress run listed under `## In-progress runs` before applying code fixes (e.g. `gh run cancel <id>`). Runs may complete between the tick and your action; treat cancellation errors on already-finished runs as non-fatal. Skip this step if you are only resolving threads without pushing — the existing runs remain relevant.
3. Apply code fixes: read and edit each file referenced under `## Review threads` above.
4. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
5. Before running the `resolve:` command, remove any thread from `--reply-thread-ids` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.
6. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
7. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
8. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
