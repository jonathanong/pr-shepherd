# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #45 anchored at PR #452 (2 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `escalate`

## Pull requests

- [PR #451: Layer needing a decision](https://github.com/owner/repo/pull/451) [ESCALATE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · stack `45` position `1/2` base `main`
  - head `needs-decision` at `4511111111111111111111111111111111111111` · base `main`
  - reasons: `fix-thrash`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/451 --until-terminal --no-auto-mark-ready`
- [PR #452: Held upper draft](https://github.com/owner/repo/pull/452) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · stack blocked by PR #451 · stack `45` position `2/2` base `main`
  - head `held-upper` at `4521111111111111111111111111111111111111` · base `needs-decision`
  - reasons: `draft-auto-mark-ready-disabled`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/452 --timeout 1s --debounce 0s --no-auto-mark-ready` · bounded probe

## Instructions

1. PR #451 requires human action (fix-thrash). Stop for that decision.
