# PR #42 [WAIT]

**status** `READY` · **repo** `owner/repo`
**remainingSeconds** 600
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

WAIT: 600s until auto-cancel

## Instructions

1. Non-terminal — no action needed this tick. Iterate immediately with the same options to continue.
