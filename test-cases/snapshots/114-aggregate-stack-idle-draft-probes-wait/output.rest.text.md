# owner/repo stack #44 — actionable

Stack: #44 · anchor PR #442 · 2 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #441: Draft with pending CI](https://github.com/owner/repo/pull/441) — not shepherded · not mergeable (`draft`) · owned
  - OPEN · draft · position 1/2 · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- [PR #442: Upper draft](https://github.com/owner/repo/pull/442) — not shepherded · not mergeable (`draft`) · owned
  - OPEN · draft · position 2/2 · base `draft-pending`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Run `pr-shepherd https://github.com/owner/repo/pull/442 --timeout 1s --debounce 0s --no-auto-mark-ready` first for PR #442. If it returns `[WAIT]` saying the draft is held only because automatic mark-ready is disabled, run `pr-shepherd iterate https://github.com/owner/repo/pull/442 --transport rest` to authorize the CCR ready transition; otherwise follow the probe's instructions.
2. After the selected one-PR sessions, rerun this same `--stack` selector.
