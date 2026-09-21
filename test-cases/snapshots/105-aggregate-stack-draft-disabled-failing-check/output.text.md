# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #43 anchored at PR #431 (1 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `fix_code`

## Pull requests

- [PR #431: Draft CI failure](https://github.com/owner/repo/pull/431) [FIX_CODE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `UNSTABLE` · flags `draft` · stack `43` position `1/1` base `main`
  - head `draft-failing` at `4311111111111111111111111111111111111111` · base `main`
  - checks: 1 failing
  - reasons: `failing-checks`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/431 --timeout 1s --debounce 0s --no-auto-mark-ready`

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/431 --timeout 1s --debounce 0s --no-auto-mark-ready` for PR #431.
3. Keep upper draft PRs in draft until every lower layer has completed Shepherd READY.
4. After the selected one-PR sessions, rerun this same `--stack` selector.
