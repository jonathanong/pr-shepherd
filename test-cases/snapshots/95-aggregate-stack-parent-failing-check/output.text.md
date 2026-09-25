# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #33 anchored at PR #322 (2 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `shepherd`

## Pull requests

- [PR #321: CI failure](https://github.com/owner/repo/pull/321) [FIX_CODE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `UNSTABLE` · stack `33` position `1/2` base `main`
  - head `foundation` at `c111111111111111111111111111111111111111` · base `main`
  - checks: 1 passing, 1 failing
  - reasons: `failing-checks`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/321 --until-terminal`
- [PR #322: Verified child](https://github.com/owner/repo/pull/322) [CANCEL]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `33` position `2/2` base `main`
  - head `child` at `c222222222222222222222222222222222222222` · base `foundation`
  - reasons: `appears-ready`

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/321 --until-terminal` for PR #321.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
