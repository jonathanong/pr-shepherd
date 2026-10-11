# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo` · **baseBranch** `main`
**summary** 0 passing, 0 skipped, 0 filtered, 0 inProgress, 0 superseded · **remainingSeconds** 600 · **blockingBotReviewInProgress** false · **isDraft** false · **shouldCancel** false

## Checks

- `CI › tests (ubuntu)` [conclusion: FAILURE]
  - run: `1234567890`
  - URL: `https://github.com/owner/repo/actions/runs/1234567890`
  - failed step: Run tests

## Failing checks

- `1234567890` — `CI › tests (ubuntu)` [conclusion: FAILURE]
  > Run tests
  rerun: `gh run rerun 1234567890 -R owner/repo`

## Post-fix actions

- base: `main`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. Rerun Shepherd now.
