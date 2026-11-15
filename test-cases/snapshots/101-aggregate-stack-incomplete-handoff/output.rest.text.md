# owner/repo stack #39 — actionable

anchor PR #382 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #381: Verified foundation — shepherded · mergeable
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #382: Unverified child — mergeable, no READY receipt yet
  - OPEN · base `foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Start one concurrent one-PR session per command below; none for layers without one. Run each command as its own session: one multi-PR `pr-shepherd <PR> <PR>` poll records no READY receipts.
2. Run `pr-shepherd https://github.com/owner/repo/pull/382 --until-terminal`. It looks ready, but only its own one-PR session records the READY receipt a stack merge needs.
3. After the selected one-PR sessions, rerun `pr-shepherd stack "owner/repo#39" --until-terminal --transport rest`. Keep watching until every layer is terminal.
