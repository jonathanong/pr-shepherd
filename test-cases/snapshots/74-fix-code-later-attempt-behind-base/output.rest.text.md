# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `BEHIND` · **repo** `owner/repo`
**branch** behind PR base `main`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Failing checks

- `801` — `CI › tests` [conclusion: FAILURE] [attempt: 2]

## Instructions

1. Fix each warranted item above.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. The workflow rerun still fails while the branch is behind PR base branch `main`. Inspect the current base branch for an existing fix before choosing a remediation.
4. Rebase or otherwise update the PR branch from `main` according to repository conventions.
5. Push the updated PR head branch before iterating immediately.
6. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
7. `[FIX_CODE]` is non-terminal. Rerun the same command now.
