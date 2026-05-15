# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Failing checks

- external `https://external.ci/builds/42` — `external-status` [conclusion: FAILURE]

## Post-fix push

- base: `main`

## Instructions

1. For each bullet in `## Failing checks` starting with `external` (external status check): open the linked URL in a browser to inspect the failure — log tails are not available for external checks.
2. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
3. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease`
4. CI needs time to run on the new push. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
