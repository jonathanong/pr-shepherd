# owner/repo stack #37 — actionable

anchor PR #362 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #361: Verified foundation — shepherded · mergeable
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #362: Stale child — shepherded · not mergeable (`stale-ancestry`) · owned
  - OPEN · base `foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Stack ancestry

- PR #362 base `foundation` at `0222222222222222222222222222222222222222` differs from parent PR #361 head `foundation` at `0111111111111111111111111111111111111111`.

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/362 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/362 --until-terminal --transport rest`. Keep watching until every layer is terminal.
