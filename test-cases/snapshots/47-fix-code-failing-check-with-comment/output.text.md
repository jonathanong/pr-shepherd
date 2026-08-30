# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Actionable comments

### [commentId=IC_with_check](https://github.com/owner/repo/pull/42#issuecomment-47) (@reviewer · User)

> Please also update the changelog for this change.

## Failing checks

- `4701` — `CI › lint` [conclusion: FAILURE] [rerun authorized]
  > Run oxlint
  rerun: `gh run rerun 4701 -R owner/repo`

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Actionable comments`, `## Failing checks` and decide whether it needs a code change.
2. Apply every warranted review fix in the relevant files.
3. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
4. A `[rerun authorized]` check includes a `rerun:` command. See "CI failure triage" in the pr-shepherd skill for which conclusions warrant a rerun versus a code fix.
5. If you changed code, commit any remaining changes, then stop and hand off for a push whose authorization is established outside Shepherd; do not run the remaining review mutations or iterate until the remote PR head changes. Shepherd cannot verify the Git credential's push authorization. If you did not change code, do not commit and continue with the remaining steps.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. `[FIX_CODE]` is non-terminal. Run any warranted reruns for `[rerun authorized]` checks (or apply code fixes for real failures), then iterate again with the same options to continue.
