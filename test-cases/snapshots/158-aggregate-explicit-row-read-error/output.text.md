# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** PRs #42, #43 · **mode** `summary`

## Pull requests

- [PR #42: Many check runs](https://github.com/owner/repo/pull/42) [TRIAGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN`
  - head `many-checks` at `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` · base `main`
  - reasons: `summary-read-failed`
  - error: GitHub REST GET /repos/owner/repo/commits/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/check-runs failed: pagination limit reached
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal`
- [PR #43: Draft follow-up](https://github.com/owner/repo/pull/43) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · blocking reviewer `in progress`
  - head `follow-up` at `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · base `many-checks`
  - reasons: `blocking-reviewer-in-progress`

## Instructions

1. Choose each non-WAIT, non-CANCEL row that can proceed independently and run or delegate its exact `pollCommand`.
2. Follow each selected one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal --ready-delay 0s --stall-timeout 3600s` again after selected work completes; one row's `ESCALATE` does not stop work on other rows. Do not end the turn while any selected row is non-terminal: a one-PR poll returning `CANCEL` or `ESCALATE` finishes only that row, and rows that are `CANCEL`, `ESCALATE`, or handed off do not count.
