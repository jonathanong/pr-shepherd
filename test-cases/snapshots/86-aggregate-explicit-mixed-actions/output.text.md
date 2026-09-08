# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** PRs #42, #43 · **mode** `summary`

## Pull requests

- [PR #42: Fix &lt;unsafe&gt; &amp; flaky CI](https://github.com/owner/repo/pull/42) [FIX_CODE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `UNSTABLE`
  - head `fix-ci` at `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` · base `main`
  - checks: 2 passing, 1 failing, 1 superseded, incomplete
  - review: 1 comment, 1 actionable, incomplete
  - reasons: `failing-checks`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal`
- [PR #43: Draft follow-up](https://github.com/owner/repo/pull/43) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · blocking reviewer `in progress`
  - head `follow-up` at `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · base `fix-ci`
  - reasons: `blocking-reviewer-in-progress`

## Instructions

1. Choose each non-WAIT, non-CANCEL row that can proceed independently and run or delegate its exact `pollCommand`.
2. Follow each selected one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.
3. Run this aggregate poll again after selected work completes; one row's `ESCALATE` does not stop work on other rows.
