# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #35 anchored at PR #342 (2 PRs) · **mode** `summary` · **stack mergeable** `true` · **next action** `escalate`

## Pull requests

- [PR #341: Verified foundation](https://github.com/owner/repo/pull/341) [MERGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `35` position `1/2` base `main`
  - head `foundation` at `e111111111111111111111111111111111111111` · base `main`
  - reasons: `appears-ready`
- [PR #342: Verified child](https://github.com/owner/repo/pull/342) [MERGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `35` position `2/2` base `main`
  - head `child` at `e222222222222222222222222222222222222222` · base `foundation`
  - reasons: `appears-ready`

## Instructions

1. Stack #35 in `owner/repo` is mergeable through PR #342; this aggregate selector will not mutate it.
2. Hand off the native-stack merge to the stack owner. After a merge attempt, rerun this same `--stack --merge` selector to reconcile every layer; shepherd any layer that GitHub rejects or ejects.
