# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #31 anchored at PR #302 (2 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `shepherd`

## Pull requests

- [PR #301: Draft foundation](https://github.com/owner/repo/pull/301) [MARK_READY]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · stack `31` position `1/2` base `main`
  - head `foundation` at `a111111111111111111111111111111111111111` · base `main`
  - reasons: `draft-appears-ready`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/301 --until-terminal`
- [PR #302: Ready-looking child](https://github.com/owner/repo/pull/302) [CANCEL]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `31` position `2/2` base `main`
  - head `child` at `a222222222222222222222222222222222222222` · base `foundation`
  - reasons: `appears-ready`

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/301 --until-terminal` for PR #301.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
