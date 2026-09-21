# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #38 anchored at PR #372 (2 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `escalate`

## Pull requests

- [PR #371: Closed foundation](https://github.com/owner/repo/pull/371) [ESCALATE]
  - state `CLOSED` · mergeable `UNKNOWN` · merge `UNKNOWN` · stack `38` position `1/2` base `main`
  - head `foundation` at `1111111111111111111111111111111111111111` · base `main`
  - reasons: `closed`, `closed-unmerged-dependency`
- [PR #372: Open child](https://github.com/owner/repo/pull/372) [CANCEL]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `38` position `2/2` base `main`
  - head `child` at `1222222222222222222222222222222222222222` · base `foundation`
  - reasons: `appears-ready`

## Instructions

1. PR #371 was closed without merging below an open layer. Stop and ask the stack owner whether to restore that dependency or rebuild the upper branches.
