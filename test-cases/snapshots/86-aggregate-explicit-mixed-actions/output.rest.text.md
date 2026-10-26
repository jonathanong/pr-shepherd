# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** PRs #42, #43 · **mode** `summary`

## Pull requests

- [PR #42: Fix &lt;unsafe&gt; &amp; flaky CI](https://github.com/owner/repo/pull/42) [TRIAGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `UNSTABLE`
  - head `fix-ci` at `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` · base `main`
  - checks: 2 passing, 1 failing, 1 superseded, incomplete
  - review: 1 comment, 1 actionable, incomplete
  - reasons: `failing-checks`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal`
- [PR #43: Draft follow-up](https://github.com/owner/repo/pull/43) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · blocking reviewer `in progress`
  - head `follow-up` at `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · base `fix-ci`
  - reasons: `blocking-reviewer-in-progress`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Choose each non-WAIT, non-CANCEL row that can proceed independently and run or delegate its exact `pollCommand`.
2. Follow each selected one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal --ready-delay 0s --stall-timeout 3600s --transport rest` again after selected work completes; one row's `ESCALATE` does not stop work on other rows. Do not end the turn while any selected row is non-terminal: a one-PR poll returning `CANCEL` or `ESCALATE` finishes only that row, and rows that are `CANCEL`, `ESCALATE`, or handed off do not count.
