# owner/repo stack #31 — actionable

anchor PR #302 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #301: Draft foundation — not mergeable (`draft`)
  - OPEN · draft · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #302: Ready-looking child — shepherded · mergeable
  - OPEN · base `foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Start one concurrent one-PR session per command below; none for layers without one.
2. Run `pr-shepherd https://github.com/owner/repo/pull/301 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack "owner/repo#31" --until-terminal --transport rest`. Keep watching until every layer is terminal.
