# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Failing checks

- `999` — `CI (startup failure)` [conclusion: STARTUP_FAILURE]
  > Process exited early

## Cancelled runs

- `999`

## Post-fix push

- base: `main`

## Instructions

1. Decide for each item under `## Failing checks` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase, push. **If no code changes are needed:** no push is needed.
2. For each failing check under `## Failing checks`: for `[conclusion: STARTUP_FAILURE]` entries: inspect with `gh run view <runId>` and rerun with `gh run rerun <runId>` if the workflow should be retried.
3. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
4. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — those runs were already cancelled by the CLI before this turn.
5. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
6. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `pr-shepherd 42` to recheck once after a fresh 30s–4m delay.
