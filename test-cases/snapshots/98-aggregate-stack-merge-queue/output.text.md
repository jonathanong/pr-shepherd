# Poll summary [TIMEOUT]

**repo** `owner/repo` · **selection** stack #36 anchored at PR #352 (2 PRs) · **mode** `summary` · **stack mergeable** `true` · **next action** `fix_code`

## Pull requests

- [PR #351: Queued foundation](https://github.com/owner/repo/pull/351) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `queued` · Shepherd READY completion `verified` · stack `36` position `1/2` base `main`
  - head `foundation` at `f111111111111111111111111111111111111111` · base `main`
  - reasons: `already-in-merge-queue`
- [PR #352: Queued child](https://github.com/owner/repo/pull/352) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `queued` · Shepherd READY completion `verified` · stack `36` position `2/2` base `main`
  - head `child` at `f222222222222222222222222222222222222222` · base `foundation`
  - reasons: `already-in-merge-queue`

## Instructions

1. The stack is in the merge queue. Recheck at the configured polling cadence; finish only after every layer is merged, and route any ejected layer to its one-PR session.
