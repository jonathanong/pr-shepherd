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

## Review IDs to minimize queue

- `PRR_seen`

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_thread1 --minimize-comment-ids PRR_first,PRR_seen --require-sha "$HEAD_SHA"`

## Instructions

1. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
2. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
3. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease` — capture `HEAD_SHA=$(git rev-parse HEAD)`
4. Review the bodies shown under `## Review summaries (first look)` — you are seeing these for the first time. Any IDs eligible for minimization are already included in the resolve command's `--minimize-comment-ids`; if any warrants a Shepherd Journal note, append it before running resolve.
5. Items under `## Review summaries (edited since first look)` and any first-look bullet tagged `, edited` were updated by their author after you previously acknowledged them. Read the updated body before deciding whether any matching `## Review threads to resolve` item should be resolved.
6. Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA.
7. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
8. CI needs time to run on the new push. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
