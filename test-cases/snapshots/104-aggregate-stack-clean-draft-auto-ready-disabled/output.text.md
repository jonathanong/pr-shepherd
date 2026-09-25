# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** stack #42 anchored at PR #421 (1 PRs) · **mode** `summary` · **stack mergeable** `false` · **next action** `shepherd`

## Pull requests

- [PR #421: Clean draft](https://github.com/owner/repo/pull/421) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · stack `42` position `1/1` base `main`
  - head `draft` at `4211111111111111111111111111111111111111` · base `main`
  - reasons: `draft-auto-mark-ready-disabled`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/421 --timeout 1s --debounce 0s --no-auto-mark-ready` · bounded probe

## Instructions

1. Automatic mark-ready is disabled, so marking PR #421 ready for review is your step. Run `pr-shepherd https://github.com/owner/repo/pull/421 --timeout 1s --debounce 0s --no-auto-mark-ready` first. If it returns `[WAIT]` saying PR #421 stays in draft because automatic mark-ready is disabled for this session, run `gh pr ready 421 -R owner/repo`; otherwise complete its instructions and leave PR #421 in draft this round.
2. After the selected one-PR sessions, rerun this same `--stack` selector.
