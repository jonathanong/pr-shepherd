# Poll summary [TIMEOUT]

**repo** `owner/repo` · **selection** stack #46 anchored at PR #461 (1 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `wait`

## Pull requests

- [PR #461: Draft awaiting review](https://github.com/owner/repo/pull/461) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · blocking reviewer `in progress` · stack `46` position `1/1` base `main`
  - head `draft-review` at `4611111111111111111111111111111111111111` · base `main`
  - reasons: `blocking-reviewer-in-progress`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/461 --timeout 1s --debounce 0s --no-auto-mark-ready` · bounded probe

## Instructions

1. No one-PR session can advance the stack yet: PR #461 (blocking-reviewer-in-progress). Recheck at the configured polling cadence.
