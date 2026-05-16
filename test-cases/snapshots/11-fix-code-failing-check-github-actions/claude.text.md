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

1. Decide for each item under `## Failing checks` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase if the header shows `**branch**` behind/conflicts, push, then run the `resolve:` command. **If no code changes are needed:** skip cancellation/commit/push and run only the `resolve:` command.
2. For each failing check under `## Failing checks`: fetch the log with `gh run view <runId> --log-failed` and decide: rerun with `gh run rerun <runId> --failed` for transient infrastructure failures (network timeout, OOM kill, runner crash), or apply a code fix for real test/build failures.
3. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
4. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — the CLI cancelled those runs before your push, and your push has already triggered new runs with different IDs.
5. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
