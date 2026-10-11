# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Actionable comments

### [commentId=IC_actionable](https://github.com/owner/repo/pull/42#issuecomment-1) (@reviewer) [edited since first look]

> This approach might cause a race condition. Please review the locking strategy.

## Instructions

1. Fix each warranted item.
2. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. Rerun this command now.
