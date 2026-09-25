# Poll summary [TIMEOUT]

**repo** `owner/repo` · **selection** stack #44 anchored at PR #442 (2 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `wait`

## Pull requests

- [PR #441: Draft with pending CI](https://github.com/owner/repo/pull/441) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `UNSTABLE` · flags `draft` · stack `44` position `1/2` base `main`
  - head `draft-pending` at `4411111111111111111111111111111111111111` · base `main`
  - checks: 1 in progress
  - reasons: `pending-or-unknown`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/441 --timeout 1s --debounce 0s --no-auto-mark-ready` · bounded probe
- [PR #442: Upper draft](https://github.com/owner/repo/pull/442) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · stack blocked by PR #441 · stack `44` position `2/2` base `main`
  - head `draft-upper` at `4421111111111111111111111111111111111111` · base `draft-pending`
  - reasons: `draft-auto-mark-ready-disabled`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/442 --timeout 1s --debounce 0s --no-auto-mark-ready` · bounded probe

## Instructions

1. No one-PR session can advance the stack yet: PR #441 (pending-or-unknown); PR #442 (stack-blocked by PR #441). Recheck at the configured polling cadence.
