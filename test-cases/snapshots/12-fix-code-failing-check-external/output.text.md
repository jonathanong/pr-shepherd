# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Failing checks

- external `https://external.ci/builds/42` — `external-status` [conclusion: FAILURE]

## Post-fix push

- base: `main`

## Instructions

1. Decide for each item under `## Failing checks` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase, push. **If no code changes are needed:** no push is needed.
2. For each failing check under `## Failing checks`: for `external` entries (no run ID, has URL): open the URL to inspect the failure.
3. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
4. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
5. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `pr-shepherd 42` to recheck once after a fresh 30s–4m delay.
