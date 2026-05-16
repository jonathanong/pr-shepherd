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
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_thread1 --minimize-comment-ids PRR_overlap --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads`, `## Changes-requested reviews` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase if the header shows `**branch**` behind/conflicts, push, then run the `resolve:` command. **If no code changes are needed:** skip cancellation/commit/push and run only the `resolve:` command.
2. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
3. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
4. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
5. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push).
6. Review the bodies shown under `## Review summaries (first look)` — you are seeing these for the first time. Any IDs eligible for minimization are already included in the resolve command's `--minimize-comment-ids`; if any warrants a Shepherd Journal note, append it before running resolve.
7. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
8. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun `npx pr-shepherd 42` to recheck.
