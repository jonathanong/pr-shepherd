# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Failing checks

- `200` — `CI / tests` [conclusion: FAILURE]

## Post-fix push

- base: `main`

## Instructions

1. Decide for each item under `## Failing checks` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push. **If no code changes are needed:** no push is needed.
2. For each failing check under `## Failing checks`: read any included log excerpt first; fetch the full log with `gh run view <runId> --log-failed` if insufficient; rerun with `gh run rerun <runId> --failed` for transient infra failures, or apply a code fix for real test/build failures; if API/log output lacks detail, open the run URL in the GitHub UI.
3. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
4. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
