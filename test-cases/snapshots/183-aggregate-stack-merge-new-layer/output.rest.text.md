# owner/repo stack #62 [ESCALATE] — actionable

anchor PR #621 · 3 layers · mode `summary`
nextAction: escalate

## Layers

- PR #621: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #622: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-621`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #623: Layer 3 — shepherded · mergeable
  - OPEN · base `layer-622`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. `unapproved-stack-layer`: PR #623 joined this stack after the merge was requested, so the request does not cover it. Nothing was merged. Stop and ask the user whether that layer is covered. If yes, rerun `pr-shepherd stack https://github.com/owner/repo/pull/621 --until-terminal --merge --transport rest` with the covered PRs listed explicitly after `stack`. If no, rerun with `--merge-through 622`, the last approved PR.
