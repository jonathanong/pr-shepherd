# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Actionable comments

### [commentId=IC_with_check](https://github.com/owner/repo/pull/42#issuecomment-47) (@reviewer · User)

> Please also update the changelog for this change.

## Failing checks

- `4701` — `CI › lint` [conclusion: FAILURE]
  > Run oxlint

## Cancelled runs

- `4701`

## Post-fix push

- base: `main`

## Instructions

1. Decide for each item under `## Actionable comments`, `## Failing checks` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push. **If no code changes are needed:** no push is needed.
2. Apply code fixes: read and edit each file referenced under `## Actionable comments` above.
3. For each failing check under `## Failing checks`: fetch the log with `gh run view <runId> --log-failed` and decide: rerun with `gh run rerun <runId> --failed` for transient infrastructure failures (network timeout, OOM kill, runner crash), or apply a code fix for real test/build failures.
4. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — those runs were already cancelled by the CLI before this turn.
5. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
6. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
