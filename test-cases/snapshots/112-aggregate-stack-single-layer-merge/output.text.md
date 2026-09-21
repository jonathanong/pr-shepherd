# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #50 anchored at PR #501 (1 PRs) · **mode** `summary` · **stack mergeable** `true` · **next action** `merge`

## Pull requests

- [PR #501: Verified single layer](https://github.com/owner/repo/pull/501) [MERGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `50` position `1/1` base `main`
  - head `single` at `5011111111111111111111111111111111111111` · base `main`
  - reasons: `appears-ready`

## Instructions

1. Check `gh stack merge --help`. If the `gh-stack` extension is unavailable, run `gh extension install github/gh-stack`, then rerun this same `--stack --merge` selector before merging.
2. Stack #50 in `owner/repo` is mergeable through PR #501. Run `GH_REPO=owner/repo gh stack merge --yes --squash 50` to merge the whole native stack or enqueue it when the base uses a merge queue.
3. After the merge attempt, rerun this same `--stack --merge` selector until every layer is merged (`CANCEL`); shepherd any layer that GitHub rejects or ejects.
