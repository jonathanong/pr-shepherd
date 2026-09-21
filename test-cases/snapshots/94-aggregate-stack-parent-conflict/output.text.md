# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #32 anchored at PR #312 (2 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `escalate`

## Pull requests

- [PR #311: Conflicting foundation](https://github.com/owner/repo/pull/311) [FIX_CODE]
  - state `OPEN` · mergeable `CONFLICTING` · merge `DIRTY` · stack `32` position `1/2` base `main`
  - head `foundation` at `b111111111111111111111111111111111111111` · base `main`
  - reasons: `merge-conflicts`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/311 --until-terminal`
- [PR #312: Verified child](https://github.com/owner/repo/pull/312) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · Shepherd READY completion `verified` · stack blocked by PR #311 · stack `32` position `2/2` base `main`
  - head `child` at `b222222222222222222222222222222222222222` · base `foundation`
  - reasons: `appears-ready`, `lower-layer-not-ready`

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/311 --until-terminal` for PR #311.
3. Keep upper draft PRs in draft until every lower layer has completed Shepherd READY.
4. After the selected one-PR sessions, rerun this same `--stack` selector.
