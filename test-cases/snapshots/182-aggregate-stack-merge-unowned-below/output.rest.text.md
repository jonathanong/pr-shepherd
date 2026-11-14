# owner/repo stack #61 [ESCALATE] — actionable

anchor PR #611 · 3 layers · mode `summary`
nextAction: escalate

## Layers

- PR #611: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #612: Layer 2 — shepherded · mergeable · owned
  - OPEN · base `layer-611`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #613: Layer 3 — shepherded · mergeable · owned
  - OPEN · base `layer-612`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. `unowned-stack-layers`: merging PR #613 would also land #611, which the caller does not own. Nothing was merged. Stop and tell the user which PRs would be merged. They either approve it, and you rerun `pr-shepherd stack https://github.com/owner/repo/pull/612 https://github.com/owner/repo/pull/613 --until-terminal --merge --transport rest` with those PRs listed after `stack`, or wait for their owner to finish.
