# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Shepherd could not use the PR's base branch name from GitHub (empty, or characters outside `[A-Za-z0-9._/-]`), so it prints no command that names the base. Read it with `gh api repos/owner/repo/pulls/42 --jq .base.ref` and quote it in any command you run.
2. The branch has merge conflicts (see `**branch**` above). Check the base branch's instructions (such as `AGENTS.md`) only for whether to rebase or merge, update the branch from its base that way, and resolve each conflict keeping both sides' changes unless they contradict.
3. Commit any remaining conflict-resolution changes and push to the PR head branch.
4. Rerun Shepherd now.
