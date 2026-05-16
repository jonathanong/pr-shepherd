# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress · **branch** conflicts with `origin/main`

## In-progress runs

- `200`

## Post-fix push

- base: `main`

## Instructions

1. The branch has merge conflicts — rebase onto `origin/main` per your repository's conventions to resolve them, then push.
2. If you decide to push new commits: cancel each in-progress run listed under `## In-progress runs` before applying code fixes (e.g. `gh run cancel <id>`). Skip this step if you are only resolving threads without pushing — the existing runs remain relevant.
3. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
