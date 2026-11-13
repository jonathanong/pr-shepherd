# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**summary** 1 passing · **branch** conflicts with PR base `main`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Files changed on both sides since the merge base

- `src/a.ts`
- `lib/new.ts`

## Instructions

1. The branch has merge conflicts (see `**branch**` above). Update the branch from its base the way this repository's instructions say (rebase or merge), and resolve each conflict keeping both sides' changes unless they contradict.
2. Start with the files under `## Files changed on both sides since the merge base`: the PR and its base both changed them, so they are the likeliest conflicts, but GitHub does not list conflicting files and the list may be incomplete. Resolve the conflicts yourself rather than handing them to the user.
3. Commit any remaining conflict-resolution changes and push to the PR head branch.
4. Rerun Shepherd now.
