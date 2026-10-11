# PR #42 [FIX_CODE]

**status** `FAILING`

## Failing checks

- `27325033780` — `CI › tests` [conclusion: FAILURE]
  > All checks passed
  > One or more required jobs failed or were cancelled
  > ##[error]Process completed with exit code 1.
  > Job results (non-success):
  > test-playwright: failure
  > test-playwright-credentialed: failure
  rerun: `gh run rerun 27325033780 -R owner/repo`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. Rerun Shepherd now.
