# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Failing checks

- external `https://external.ci/builds/42` — `external-status` [conclusion: FAILURE]

## Post-fix push

- base: `main`

## Instructions

1. Decide for each item under `## Review threads` and `## Actionable comments` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs, apply edits, commit, rebase if the header shows `**branch**` behind/conflicts, push, then run the `resolve:` command. **If no code changes are needed:** skip cancellation/commit/push and run only the `resolve:` command.
2. For each failing check under `## Failing checks`: for `external` entries (no run ID, has URL): open the URL to inspect the failure.
3. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
4. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun `npx pr-shepherd 42` to recheck.
