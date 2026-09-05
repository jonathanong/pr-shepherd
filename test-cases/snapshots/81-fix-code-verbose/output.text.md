# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo` · **baseBranch** `main`
**summary** 0 passing, 0 skipped, 0 filtered, 0 inProgress, 0 superseded · **remainingSeconds** 600 · **blockingBotReviewInProgress** false · **isDraft** false · **shouldCancel** false
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
2. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
3. A `[rerun authorized]` check includes a `rerun:` command. See "CI failure triage" in the pr-shepherd skill for which conclusions warrant a rerun versus a code fix.
4. If you changed code, commit any remaining changes and push to the PR head branch, then run the remaining review mutations using the pushed commit SHA and iterate immediately with the same options. If you did not change code, do not commit and continue with the remaining steps.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
6. `[FIX_CODE]` is non-terminal. Run any warranted reruns for `[rerun authorized]` checks (or apply code fixes for real failures), then iterate immediately with the same options to continue.
