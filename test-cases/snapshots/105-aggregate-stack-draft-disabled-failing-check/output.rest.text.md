# owner/repo stack #43 — actionable

anchor PR #431 · 1 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #431: Draft CI failure — not mergeable (`draft`) · owned
  - OPEN · draft · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/431 --timeout 1s --debounce 0s --no-auto-mark-ready`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/431 --until-terminal --no-auto-mark-ready --transport rest`. Keep watching until every layer is terminal.
