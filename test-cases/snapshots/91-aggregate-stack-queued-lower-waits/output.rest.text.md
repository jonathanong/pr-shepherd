# owner/repo stack #12 [CANCEL] — all_terminal

anchor PR #202 · 2 layers · mode `summary`
stackMergeable: true
nextAction: cancel

## Layers

- [PR #201: Base layer queued](https://github.com/owner/repo/pull/201) — shepherded · mergeable
  - OPEN · position 1/2 · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- [PR #202: Ready upper layer](https://github.com/owner/repo/pull/202) — shepherded · mergeable
  - OPEN · position 2/2 · base `feature-base`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Stop — every stack layer is terminal or fully READY.
