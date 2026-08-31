# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `27325033780` — `CI › tests` [conclusion: FAILURE] [rerun authorized]
  > All checks passed
  > One or more required jobs failed or were cancelled
  > ##[error]Process completed with exit code 1.
  > Job results (non-success):
  > test-playwright: failure
  > test-playwright-credentialed: failure
  rerun: `gh run rerun 27325033780 -R owner/repo`

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
3. A `[rerun authorized]` check includes a `rerun:` command. See "CI failure triage" in the pr-shepherd skill for which conclusions warrant a rerun versus a code fix.
4. If you changed code, commit any remaining changes and push to the PR head branch, then run the remaining review mutations using the pushed commit SHA and iterate again with the same options. If you did not change code, do not commit and continue with the remaining steps.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
6. `[FIX_CODE]` is non-terminal. Run any warranted reruns for `[rerun authorized]` checks (or apply code fixes for real failures), then iterate again with the same options to continue.
