# PR #42 [FIX_CODE]

**status** `IN_PROGRESS`
**summary** 1 inProgress
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
**activity** 0 commits · 0 review rounds · active: `CI / build`

## Actionable comments

### [commentId=IC_comment1](https://github.com/owner/repo/pull/42#issuecomment-1) (@reviewer)

> Please update the README with usage examples.

## Instructions

1. Fix each warranted item.
2. Commit and push any changes.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Rerun Shepherd now.
