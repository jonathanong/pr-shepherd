# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Failing checks

- `1234567890` — `CI › tests (ubuntu)` [conclusion: FAILURE]
  > Run tests

## Cancelled runs

- `1234567890`

## Post-fix push

- base: `main`

## Instructions

1. For each failing check under `## Failing checks` with a run ID and no `[conclusion: CANCELLED]` or `[conclusion: STARTUP_FAILURE]` tag: run `gh run view <runId> --log-failed` to fetch the failing job's log. If the log shows a transient infrastructure failure (network timeout, runner setup crash, OOM kill), run `gh run rerun <runId> --failed`. If the log shows a real test/build failure, apply a code fix.
2. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
3. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease`
4. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — the CLI cancelled those runs before your push, and your push has already triggered new runs with different IDs.
5. CI needs time to run on the new push. Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun `npx pr-shepherd 42` to recheck.
