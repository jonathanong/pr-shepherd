# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Failing checks

- `200` — `CI / tests` [conclusion: FAILURE]

## Post-fix push

- base: `main`

## Instructions

1. For each failing check under `## Failing checks` with a run ID and no `[conclusion: CANCELLED]` or `[conclusion: STARTUP_FAILURE]` tag: run `gh run view <runId> --log-failed` to fetch the failing job's log. If the log shows a transient infrastructure failure (network timeout, runner setup crash, OOM kill), run `gh run rerun <runId> --failed`. If the log shows a real test/build failure, apply a code fix.
2. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
3. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease`
4. CI needs time to run on the new push. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
