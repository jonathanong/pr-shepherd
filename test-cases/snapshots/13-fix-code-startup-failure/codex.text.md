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

1. For each `[conclusion: STARTUP_FAILURE]` bullet under `## Failing checks`: the workflow failed before jobs/logs were created. Run `gh run view <runId>` to inspect the run metadata, then run `gh run rerun <runId>` if the workflow should be attempted again.
2. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
3. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease`
4. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — the CLI cancelled those runs before your push, and your push has already triggered new runs with different IDs.
5. CI needs time to run on the new push. Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun `npx pr-shepherd 42` to recheck.
