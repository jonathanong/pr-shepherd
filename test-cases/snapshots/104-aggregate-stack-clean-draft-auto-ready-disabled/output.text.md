# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #42 anchored at PR #421 (1 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `shepherd`

## Pull requests

- [PR #421: Clean draft](https://github.com/owner/repo/pull/421) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · stack `42` position `1/1` base `main`
  - head `draft` at `4211111111111111111111111111111111111111` · base `main`
  - reasons: `draft-auto-mark-ready-disabled`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/421 --timeout 1s --debounce 0s --no-auto-mark-ready`

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/421 --timeout 1s --debounce 0s --no-auto-mark-ready` for PR #421.
3. Keep upper draft PRs in draft until every lower layer has completed Shepherd READY.
4. After the selected one-PR sessions, rerun this same `--stack` selector.
