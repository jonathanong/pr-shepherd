# Poll summary [TIMEOUT]

**repo** `owner/repo` · **selection** PRs #42, #43 · **mode** `summary`

## Pull requests

- [PR #42: CI running](https://github.com/owner/repo/pull/42) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN`
  - head `ci-running` at `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` · base `main`
  - checks: 1 in progress
  - reasons: `pending-or-unknown`
- [PR #43: Ready countdown](https://github.com/owner/repo/pull/43) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · ready delay `300s`
  - head `ready-countdown` at `ffffffffffffffffffffffffffffffffffffffff` · base `main`
  - reasons: `ready-delay`

## Instructions

1. Run `pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal` again when the caller is ready to recheck. Do not end the turn while any selected row is non-terminal: a one-PR poll returning `CANCEL` or `ESCALATE` finishes only that row, and rows that are `CANCEL`, `ESCALATE`, or handed off do not count.
