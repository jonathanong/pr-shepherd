# Poll summary [TIMEOUT]

**repo** `owner/repo` · **selection** stack #50 anchored at PR #501 (1 PRs) · **mode** `summary` · **stack mergeable** `true` · **next action** `wait`

## Pull requests

- [PR #501: Unverified single layer](https://github.com/owner/repo/pull/501) [MERGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · merge selector `unverified` (GitHub REST GET /repos/owner/repo/stacks/501 failed: 403 {"message":"Forbidden"}) · stack `50` position `1/1` base `main`
  - head `single` at `5011111111111111111111111111111111111111` · base `main`
  - reasons: `appears-ready`

## GitHub API usage

- Credential source: `GH_TOKEN`

## Instructions

1. Shepherd could not confirm that no native stack is numbered #501 (see its merge selector above), so it withholds the merge command. Recheck at the configured polling cadence.
