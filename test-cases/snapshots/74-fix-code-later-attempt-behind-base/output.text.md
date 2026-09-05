# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `BEHIND` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **branch** behind PR base `main`
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `801` — `CI › tests` [conclusion: FAILURE] [attempt: 2]

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
3. The workflow rerun still fails while the branch is behind PR base branch `main`. Inspect the current base branch for an existing fix before choosing a remediation.
4. Rebase or otherwise update the PR branch from `main` according to repository conventions.
5. Push the updated PR head branch before iterating immediately.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. `[FIX_CODE]` is non-terminal. After completing these steps, iterate immediately with the same options to continue.
