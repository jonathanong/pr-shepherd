# PR #42 [FIX_CODE]

**status** `READY` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Stack: 7 (layer 2/3, base stack/7/1)

## Instructions

1. PR #42 is layer 2 of 3 in native stack #7; do not run `gh pr merge` for this layer.
2. Run `pr-shepherd --stack https://github.com/owner/repo/pull/42 --until-terminal --merge --transport rest` to reconcile the stack and run each bottom-layer merge command it emits.
