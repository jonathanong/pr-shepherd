# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress

## Changes-requested reviews

- `reviewId=PRR_no_threads` (@architect · User)

## In-progress runs

- `999`

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 42 --dismiss-review-ids PRR_no_threads --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Changes-requested reviews` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase, push, then run the `resolve:` command. **If no code changes are needed:** skip cancellation/commit/push and run the `resolve:` command.
2. If you decide to push new commits: cancel each in-progress run listed under `## In-progress runs` before applying code fixes (e.g. `gh run cancel <id>`). Runs may complete between the tick and your action; treat cancellation errors on already-finished runs as non-fatal. Skip this step if you are only resolving threads without pushing — the existing runs remain relevant.
3. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
4. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
5. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence description of what you changed.
6. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
7. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `pr-shepherd 42` to recheck once after a fresh 30s–4m delay.
