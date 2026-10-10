# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo` · **baseBranch** `main`
**summary** 0 passing, 0 skipped, 0 filtered, 0 inProgress, 0 superseded · **remainingSeconds** 600 · **blockingBotReviewInProgress** false · **isDraft** false · **shouldCancel** false
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Checks

- `CI › tests (ubuntu)` [conclusion: FAILURE]
  - run: `1234567890`
  - URL: `https://github.com/owner/repo/actions/runs/1234567890`
  - failed step: Run tests

## Failing checks

- `1234567890` — `CI › tests (ubuntu)` [conclusion: FAILURE] [rerun authorized]
  > Run tests
  rerun: `gh run rerun 1234567890 -R owner/repo`

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`. Playbook: "Shepherd Journal".
5. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
