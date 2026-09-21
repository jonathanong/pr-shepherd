# Poll summary [TIMEOUT]

**repo** `owner/repo` · **selection** stack #12 anchored at PR #202 (2 PRs) · **mode** `summary` · **stack mergeable** `true` · **next action** `wait`

## Pull requests

- [PR #201: Base layer queued](https://github.com/owner/repo/pull/201) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `queued` · Shepherd READY completion `verified` · stack `12` position `1/2` base `main`
  - head `feature-base` at `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · base `main`
  - reasons: `appears-ready`, `already-in-merge-queue`
- [PR #202: Ready upper layer](https://github.com/owner/repo/pull/202) [CANCEL]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `12` position `2/2` base `main`
  - head `feature-upper` at `cccccccccccccccccccccccccccccccccccccccc` · base `feature-base`
  - reasons: `appears-ready`

## Instructions

1. The stack is in the merge queue. Recheck at the configured polling cadence; finish only after every layer is merged, and route any ejected layer to its one-PR session.
