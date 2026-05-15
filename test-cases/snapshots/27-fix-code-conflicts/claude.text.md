# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing

## Post-fix push

- base: `main`

## Instructions

1. Rebase with conflict resolution: run `git fetch origin && git rebase origin/main`. If the rebase halts with conflicts, edit the conflicted files to resolve them, `git add <files>`, then `git rebase --continue`. Repeat until the rebase completes, then `git push --force-with-lease`.
2. CI needs time to run on the new push. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
