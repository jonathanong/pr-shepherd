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
2. Commit any remaining conflict-resolution changes and push to the PR head branch.
3. Rerun this command now.
