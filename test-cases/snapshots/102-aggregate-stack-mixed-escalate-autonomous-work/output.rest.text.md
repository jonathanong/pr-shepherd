# owner/repo stack #40 — actionable

anchor PR #403 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #401: Human handoff — not mergeable (`draft`)
  - OPEN · draft · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #402: Independent review work — mergeable · owned
  - OPEN · base `foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #403: Pending CI — not mergeable (`checks-in-progress`) · owned
  - OPEN · base `review-work` · 1 in progress
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. PR #401 is not owned. Do not run a session for it.
3. Run `pr-shepherd https://github.com/owner/repo/pull/402 --until-terminal`.
4. Run `pr-shepherd https://github.com/owner/repo/pull/403 --until-terminal`.
5. After the selected one-PR sessions, rerun this same `--stack` selector.
