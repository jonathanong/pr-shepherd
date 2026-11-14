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

1. `unowned-stack-layers`: merging PR #613 also merges #611 ("Layer 1"), which you did not list as yours. Nothing was merged, and never merge only #613 while leaving that layer open. Stop and tell the user that merging #613 also merges #611. If they approve, run `pr-shepherd stack https://github.com/owner/repo/pull/611 https://github.com/owner/repo/pull/612 https://github.com/owner/repo/pull/613 --until-terminal --merge --transport rest` (lists #611 as yours too) or `pr-shepherd stack "owner/repo#61" --until-terminal --merge --transport rest` (the stack number owns every layer). Otherwise wait for its owner.
