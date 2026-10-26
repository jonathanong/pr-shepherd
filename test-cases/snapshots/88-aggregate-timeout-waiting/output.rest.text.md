# Poll summary [TIMEOUT]

**repo** `owner/repo` · **selection** PRs #42, #43 · **mode** `summary`

## Pull requests

- [PR #42: CI running](https://github.com/owner/repo/pull/42) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN`
  - head `ci-running` at `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` · base `main`
  - checks: 1 in progress
  - reasons: `pending-or-unknown`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- [PR #43: Ready countdown](https://github.com/owner/repo/pull/43) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · ready delay `300s`
  - head `ready-countdown` at `ffffffffffffffffffffffffffffffffffffffff` · base `main`
  - reasons: `ready-delay`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Run `pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal --ready-delay 0s --stall-timeout 3600s --transport rest` again when the caller is ready to recheck. Do not end the turn while any selected row is non-terminal: a one-PR poll returning `CANCEL` or `ESCALATE` finishes only that row, and rows that are `CANCEL`, `ESCALATE`, or handed off do not count.
