# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**summary** 1 passing · **branch** conflicts with PR base `main`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
2. The branch conflicts with PR base branch `main`. rebase --force-with-lease before pushing.
3. Commit any remaining conflict-resolution changes and push to the PR head branch.
4. `[FIX_CODE]` is non-terminal. Rerun the same command now.
