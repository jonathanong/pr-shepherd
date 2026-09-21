# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #37 anchored at PR #362 (2 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `shepherd`

## Pull requests

- [PR #361: Verified foundation](https://github.com/owner/repo/pull/361) [CANCEL]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `37` position `1/2` base `main`
  - head `foundation` at `0111111111111111111111111111111111111111` · base `main`
  - reasons: `appears-ready`
- [PR #362: Stale child](https://github.com/owner/repo/pull/362) [FIX_CODE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `37` position `2/2` base `main`
  - head `child` at `0222222222222222222222222222222222222222` · base `foundation`
  - reasons: `authoritative-poll-required`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/362 --until-terminal`

## Stack ancestry

- PR #362 base `foundation` at `0222222222222222222222222222222222222222` differs from parent PR #361 head `foundation` at `0111111111111111111111111111111111111111`.

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/362 --until-terminal` for PR #362.
3. Keep upper draft PRs in draft until every lower layer has completed Shepherd READY.
4. After the selected one-PR sessions, rerun this same `--stack` selector.
