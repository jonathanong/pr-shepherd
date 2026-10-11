# PR #42 [FIX_CODE]

**status** `READY`
**summary** 1 passing · **remainingSeconds** 600
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review summaries (edited since first look — already minimized; do not re-minimize)

### `reviewId=PRR_edit` (@reviewer)

> Updated review: looks better now, just a few minor issues remain.

## Instructions

1. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
2. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
3. Rerun Shepherd now.
