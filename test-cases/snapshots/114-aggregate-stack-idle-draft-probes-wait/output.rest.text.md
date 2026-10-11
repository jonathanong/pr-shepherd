# owner/repo stack #44 — actionable

anchor PR #442 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #441: Draft with pending CI — not mergeable (`draft`) · owned
  - OPEN · draft · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #442: Upper draft — not mergeable (`draft`) · owned
  - OPEN · draft · base `draft-pending`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Run `pr-shepherd https://github.com/owner/repo/pull/442 --timeout 1s --debounce 0s --no-auto-mark-ready` first for PR #442. If it returns `[WAIT]` saying the draft is held only because automatic mark-ready is disabled, run `pr-shepherd iterate https://github.com/owner/repo/pull/442 --transport rest` to authorize the CCR ready transition; otherwise follow the probe's instructions.
2. After the selected one-PR sessions, rerun this same `--stack` selector.
