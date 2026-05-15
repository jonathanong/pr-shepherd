# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Failing checks

- `555` — `CI / build` [conclusion: CANCELLED]

## Cancelled runs

- `555`

## Post-fix push

- base: `main`

## Instructions

1. For each `[conclusion: CANCELLED]` bullet under `## Failing checks`: the run was cancelled outside Shepherd's control (manual cancel, newer push, concurrency-group eviction). Run `gh run rerun <runId>` only if the cancellation looks unintended; otherwise treat it as resolved by the superseding run. Do NOT confuse these with IDs under `## Cancelled runs` — those were cancelled by Shepherd itself.
2. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
3. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease`
4. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — the CLI cancelled those runs before your push, and your push has already triggered new runs with different IDs.
5. CI needs time to run on the new push. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
