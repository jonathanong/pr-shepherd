# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #40 anchored at PR #403 (3 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `shepherd`

## Pull requests

- [PR #401: Human handoff](https://github.com/owner/repo/pull/401) [ESCALATE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · stack `40` position `1/3` base `main`
  - head `foundation` at `4011111111111111111111111111111111111111` · base `main`
  - reasons: `mark-ready-authorization-required`
- [PR #402: Independent review work](https://github.com/owner/repo/pull/402) [FIX_CODE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · stack `40` position `2/3` base `main`
  - head `review-work` at `4022222222222222222222222222222222222222` · base `foundation`
  - reasons: `review-work`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/402 --until-terminal`
- [PR #403: Pending CI](https://github.com/owner/repo/pull/403) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `BLOCKED` · stack `40` position `3/3` base `main`
  - head `pending-ci` at `4033333333333333333333333333333333333333` · base `review-work`
  - checks: 1 in progress
  - reasons: `pending-or-unknown`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/403 --until-terminal`

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/402 --until-terminal` for PR #402.
3. Run `pr-shepherd https://github.com/owner/repo/pull/403 --until-terminal` for PR #403.
4. PR #401 requires human action (mark-ready-authorization-required). Keep shepherding other PRs before the handoff.
5. After the listed one-PR sessions, rerun this same `--stack` selector. Stop for the human handoff only when no autonomous shepherding remains.
