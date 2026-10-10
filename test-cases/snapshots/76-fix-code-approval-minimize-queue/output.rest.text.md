# PR #42 [FIX_CODE]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **remainingSeconds** 600
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Approvals (surfaced — not minimized)

### `reviewId=PRR_bot_approval_minimize` (@coderabbitai · Bot)

> LGTM! Nice cleanup.

## Post-fix actions

- base: `main`

## Instructions

1. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
