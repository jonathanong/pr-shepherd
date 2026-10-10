# PR #42 [FIX_CODE]

**status** `FAILING` · **repo** `owner/repo`

## Failing checks

- `4801` — `CI › tests` [conclusion: FAILURE] [rerun authorized]
  > Run tests
  rerun: `gh run rerun 4801 -R owner/repo`

## Changes-requested reviews

### `reviewId=PRR_cr_with_check` (@reviewer · User)

> The failing test points at a real bug — please fix the off-by-one in the loop.

## Instructions

1. Fix each warranted item above.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any code changes.
4. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
