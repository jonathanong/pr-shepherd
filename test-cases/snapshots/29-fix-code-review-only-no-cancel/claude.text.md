# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress

## Review threads

### `threadId=PRRT_inline1` — `src/index.ts:5` (@reviewer · User)

> Please rename this variable.

## Changes-requested reviews

- `reviewId=PRR_changes_only` (@reviewer · User)

## In-progress runs

- `777`

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_inline1 --dismiss-review-ids PRR_changes_only --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Cancel in-progress CI runs first: for each ID under `## In-progress runs`, run `gh run cancel <id>` before applying code fixes. If `gh` reports a run is already completed, ignore it and continue with the next ID.
2. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
3. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
4. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
5. Keep the PR title and description current: if the changes alter the PR's scope or intent, run `gh pr edit 42 --title "<new title>" --body "<new body>"` to reflect them. Skip if the existing title/body still accurately describe the PR.
6. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease` — capture `HEAD_SHA=$(git rev-parse HEAD)`
7. Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA and $DISMISS_MESSAGE with a one-sentence description of what you changed.
8. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
9. CI needs time to run on the new push. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
