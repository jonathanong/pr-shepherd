# PR #42 [FIX_CODE]

**status** `READY` · **repo** `owner/repo`
**remainingSeconds** 600
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Approvals (surfaced — not minimized)

### `reviewId=PRR_bot_approval_minimize` (@coderabbitai · Bot)

> LGTM! Nice cleanup.

## Instructions

1. Rerun this command now.
