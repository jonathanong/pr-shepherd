# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** PRs #42, #43 · **mode** `summary`

## Pull requests

- [PR #42: Noisy bot notices](https://github.com/owner/repo/pull/42) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · ready delay `60s`
  - head `noisy` at `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` · base `main`
  - review: 2 comments, 1 review, 1 thread
  - classification auto-resolve: auto-resolved 1 thread, minimized 1 comment and 1 review summary (rules: codex-activity; coderabbit-progress)
    - thread `PRRT_notice` https://github.com/owner/repo/pull/42#discussion_r1
    - pr-comment `IC_progress` https://github.com/owner/repo/pull/42#issuecomment-1
    - review-summary `PRR_activity`
  - reasons: `ready-delay`
- [PR #43: Rejected minimize](https://github.com/owner/repo/pull/43) [TRIAGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN`
  - head `rejected` at `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · base `main`
  - review: 1 comment, 1 actionable
  - classification auto-resolve: auto-resolve failed for 1 mutation (rule: coderabbit-progress)
    - IC_stuck: Resource not accessible by integration (rule: coderabbit-progress)
  - reasons: `actionable-reviews`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/43 --until-terminal`

## Instructions

1. Choose each non-WAIT, non-CANCEL row that can proceed independently and run or delegate its exact `pollCommand`.
2. Follow each selected one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal --ready-delay 0s --stall-timeout 3600s` again after selected work completes; one row's `ESCALATE` does not stop work on other rows. Do not end the turn while any selected row is non-terminal: a one-PR poll returning `CANCEL` or `ESCALATE` finishes only that row, and rows that are `CANCEL`, `ESCALATE`, or handed off do not count.
