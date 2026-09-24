# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #50 anchored at PR #501 (1 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `escalate`

## Pull requests

- [PR #501: Colliding single layer](https://github.com/owner/repo/pull/501) [ESCALATE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · merge selector `stack-number` · stack `50` position `1/1` base `main`
  - head `single` at `5011111111111111111111111111111111111111` · base `main`
  - reasons: `appears-ready`, `pr-number-is-stack-number`

## GitHub API usage

- Credential source: `GH_TOKEN`

## Instructions

1. `gh stack merge 501` would select native stack #501 rather than PR #501. Stop and ask the stack owner how to merge PR #501.
