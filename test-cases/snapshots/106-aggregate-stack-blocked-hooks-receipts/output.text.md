# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #44 anchored at PR #443 (3 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `fix_code`

## Pull requests

- [PR #441: Blocked receipt](https://github.com/owner/repo/pull/441) [FIX_CODE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `BLOCKED` · Shepherd READY completion `verified` · stack `44` position `1/3` base `main`
  - head `blocked` at `4411111111111111111111111111111111111111` · base `main`
  - reasons: `appears-ready`, `ready-receipt-required`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/441 --until-terminal`
- [PR #442: Hooks receipt](https://github.com/owner/repo/pull/442) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `HAS_HOOKS` · Shepherd READY completion `verified` · stack blocked by PR #441 · stack `44` position `2/3` base `main`
  - head `hooks` at `4422222222222222222222222222222222222222` · base `blocked`
  - reasons: `appears-ready`, `lower-layer-not-ready`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/442 --until-terminal`
- [PR #443: Pending CI receipt](https://github.com/owner/repo/pull/443) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack blocked by PR #441 · stack `44` position `3/3` base `main`
  - head `pending-ci` at `4433333333333333333333333333333333333333` · base `hooks`
  - checks: 1 in progress
  - reasons: `appears-ready`, `lower-layer-not-ready`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/443 --until-terminal`

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/441 --until-terminal` for PR #441.
3. Run `pr-shepherd https://github.com/owner/repo/pull/442 --until-terminal` for PR #442 (stack-blocked by PR #441).
4. Run `pr-shepherd https://github.com/owner/repo/pull/443 --until-terminal` for PR #443 (stack-blocked by PR #441).
5. Keep upper draft PRs in draft until every lower layer has completed Shepherd READY.
6. After the selected one-PR sessions, rerun this same `--stack` selector.
