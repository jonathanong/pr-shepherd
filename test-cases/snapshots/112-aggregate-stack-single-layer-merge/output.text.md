# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #50 anchored at PR #501 (1 PRs) · **mode** `summary` · **stack mergeable** `true` · **next action** `merge`

## Pull requests

- [PR #501: Verified single layer](https://github.com/owner/repo/pull/501) [MERGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · merge selector `verified` · stack `50` position `1/1` base `main`
  - head `single` at `5011111111111111111111111111111111111111` · base `main`
  - reasons: `appears-ready`

## GitHub API usage

- Credential source: `GH_TOKEN`

## Instructions

1. PR #501 is the bottom open layer of stack #50 in `owner/repo` and is ready. Run `GH_REPO=owner/repo gh stack merge 501 --yes --squash` to merge that layer alone, or to enqueue it when the base uses a merge queue. If `gh stack` is an unknown command, run `gh extension install github/gh-stack` first.
2. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
