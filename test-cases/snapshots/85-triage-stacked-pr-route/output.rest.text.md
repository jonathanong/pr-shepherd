# PR #42 [TRIAGE]

**status** `READY`
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
2. Run `pr-shepherd stack https://github.com/owner/repo/pull/42 --until-terminal --merge-through https://github.com/owner/repo/pull/42 --transport rest` to merge this layer and the unmerged layers below it, never a layer above it. It emits one merge command that lands every layer it lists. Run that command as printed: do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers.
