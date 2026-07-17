# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Failing checks

- `4801` — `CI › tests` [conclusion: FAILURE]
  > Run tests

## Changes-requested reviews

- `reviewId=PRR_cr_with_check` (@reviewer · User)

## Cancelled runs

- `4801`

## Post-fix push

- base: `main`

## Instructions

1. Decide for each item under `## Failing checks`, `## Changes-requested reviews` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push. **If no code changes are needed:** no push is needed.
2. For each failing check under `## Failing checks`: read any included log excerpt first; fetch the full log with `gh run view <runId> --log-failed` if insufficient; rerun with `gh run rerun <runId> --failed` for transient infra failures, or apply a code fix for real test/build failures; if API/log output lacks detail, open the run URL in the GitHub UI.
3. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
4. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — those runs were already cancelled by the CLI before this turn.
5. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
6. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
