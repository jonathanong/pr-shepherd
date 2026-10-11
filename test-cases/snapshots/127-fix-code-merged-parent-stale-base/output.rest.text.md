# PR #2099 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `vouchington/vouchington`
**branch** conflicts with PR base `knip-exports-retentions`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Merged PRs matching the current base

- [#2095](https://github.com/vouchington/vouchington/pull/2095) · state `MERGED` · head `knip-exports-retentions` at `ed48e5c203b16eaf6037da2f3c64641912918804` · base `main` · mergedAt `2026-10-07T04:44:56Z` · headRepository `vouchington/vouchington`

## Instructions

1. Inspect every PR under `## Merged PRs matching the current base`. If this PR is the remaining layer intended for a merged parent's base branch, run `gh api --method PATCH repos/vouchington/vouchington/pulls/2099 -f base=<verified-parent-base>` after replacing `<verified-parent-base>` with that parent's shell-quoted base branch, then rerun Shepherd immediately and follow its fresh instructions instead of the remaining steps here. Otherwise keep the current base and follow the remaining conflict-resolution steps.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. Commit any remaining conflict-resolution changes and push to the PR head branch.
4. Rerun Shepherd now.
