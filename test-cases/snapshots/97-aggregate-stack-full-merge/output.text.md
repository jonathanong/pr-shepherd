# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #35 anchored at PR #342 (2 PRs) · **mode** `summary` · **stack mergeable** `true` · **next action** `merge`

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

1. PR #341 is the bottom open layer of stack #35 in `owner/repo` and is ready. Run `GH_REPO=owner/repo gh stack merge 341 --yes --squash` to merge that layer alone, or to enqueue it when the base uses a merge queue. If `gh stack` is an unknown command, run `gh extension install github/gh-stack` first.
2. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
