# PR #42 [FIX_CODE]

**status** `READY`
**summary** 1 passing · **remainingSeconds** 600
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review summaries (first look)

### `reviewId=PRR_first` (@reviewer)

> Overall the approach is good but there are a few things to clean up before merging.

## Instructions

1. Read each body under `## Review summaries (first look)` and journal any warranted note before review mutations.
2. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
3. Rerun this command now.
