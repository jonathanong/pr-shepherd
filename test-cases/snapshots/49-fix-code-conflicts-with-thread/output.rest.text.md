# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**branch** conflicts with PR base `main`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-49](https://github.com/owner/repo/pull/42#discussion_r49) — `src/merge.ts:8` (@reviewer · User)

#### [commentId=PRRC_49](https://github.com/owner/repo/pull/42#discussion_r49) (@reviewer · User)

> Rename this helper before merging.

## Instructions

1. Fix each warranted item above.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. Commit any remaining conflict-resolution changes and push to the PR head branch before review mutations.
4. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-49 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha "$(git rev-parse HEAD)"`
6. `[FIX_CODE]` is non-terminal. Rerun the same command now.
