# Poll summary [TIMEOUT]

**repo** `owner/repo` · **selection** stack #12 anchored at PR #202 (2 PRs) · **mode** `summary` · **next action** `wait`

## Pull requests

- [PR #201: Base layer queued](https://github.com/owner/repo/pull/201) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `queued` · stack `12` position `1/2` base `main`
  - head `feature-base` at `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · base `main`
  - reasons: `already-in-merge-queue`
- [PR #202: Ready upper layer](https://github.com/owner/repo/pull/202) [MERGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · stack `12` position `2/2` base `main`
  - head `feature-upper` at `cccccccccccccccccccccccccccccccccccccccc` · base `feature-base`
  - reasons: `appears-ready`

## Stack ancestry

- PR #202 base `feature-base` at `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` differs from parent PR #201 head `feature-base` at `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`.

## Instructions

1. Recheck this native stack after the lowest open layer changes state.
