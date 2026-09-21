# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #35 anchored at PR #342 (2 PRs) · **mode** `summary` · **stack mergeable** `true` · **next action** `fix_code`

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

1. Verify the checkout targets `owner/repo` and stack #35 still ends at PR #342.
2. Submit the entire stack with `gh stack merge 35 --yes --merge`. If GitHub uses a merge queue, it chooses the method.
3. If GitHub rejects the submission, use its exact error to shepherd each affected PR and do not repeat the unchanged command; otherwise rerun this same `--stack --merge` selector until every layer is merged or an explicit human escalation is reported.
