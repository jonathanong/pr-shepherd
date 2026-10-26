# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** PRs #42, #43 · **mode** `summary`

## Pull requests

- [PR #42: Rework retry policy](https://github.com/owner/repo/pull/42) [ESCALATE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `UNSTABLE`
  - head `retry-policy` at `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` · base `main`
  - reasons: `triage-thrash`
- [PR #43: Fix flaky CI](https://github.com/owner/repo/pull/43) [TRIAGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `UNSTABLE`
  - head `fix-ci` at `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · base `main`
  - checks: 2 passing, 1 failing
  - reasons: `failing-checks`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/43 --until-terminal`

## Instructions

1. Choose each non-WAIT, non-CANCEL row that can proceed independently and run or delegate its exact `pollCommand`.
2. Follow each selected one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal --ready-delay 0s --stall-timeout 3600s` again after selected work completes; one row's `ESCALATE` does not stop work on other rows. Do not end the turn while any selected row is non-terminal: a one-PR poll returning `CANCEL` or `ESCALATE` finishes only that row, and rows that are `CANCEL`, `ESCALATE`, or handed off do not count.
