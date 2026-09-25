# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #39 anchored at PR #382 (2 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `shepherd`

## Pull requests

- [PR #381: Verified foundation](https://github.com/owner/repo/pull/381) [CANCEL]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack `39` position `1/2` base `main`
  - head `foundation` at `2111111111111111111111111111111111111111` · base `main`
  - reasons: `appears-ready`
- [PR #382: Unverified child](https://github.com/owner/repo/pull/382) [FIX_CODE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · stack `39` position `2/2` base `main`
  - head `child` at `2222222222222222222222222222222222222222` · base `foundation`
  - reasons: `appears-ready`, `ready-receipt-required`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/382 --until-terminal`

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/382 --until-terminal` for PR #382.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
