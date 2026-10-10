# PR #42 [FIX_CODE]

**status** `FAILING` · **repo** `owner/repo`

## Failing checks

- `27325033780` — `CI › tests` [conclusion: FAILURE] [rerun authorized]
  > All checks passed
  > One or more required jobs failed or were cancelled
  > ##[error]Process completed with exit code 1.
  > Job results (non-success):
  > test-playwright: failure
  > test-playwright-credentialed: failure
  rerun: `gh run rerun 27325033780 -R owner/repo`

## Instructions

1. Fix each warranted item above.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any code changes.
4. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
