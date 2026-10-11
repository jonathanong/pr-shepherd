# owner/repo stack #45 — actionable

anchor PR #452 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #451: Layer needing a decision — not mergeable (`fix-thrash`) · owned
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #452: Held upper draft — not mergeable (`draft`) · owned
  - OPEN · draft · base `needs-decision`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Run `pr-shepherd https://github.com/owner/repo/pull/452 --timeout 1s --debounce 0s --no-auto-mark-ready` first for PR #452. If it returns `[WAIT]` saying the draft is held only because automatic mark-ready is disabled, run `pr-shepherd iterate https://github.com/owner/repo/pull/452 --transport rest` to authorize the CCR ready transition; otherwise follow the probe's instructions.
2. PR #451 requires human action (fix-thrash). Keep shepherding other PRs before the handoff.
3. After the listed one-PR sessions, rerun this same `--stack` selector. Stop for the human handoff only when no autonomous shepherding remains.
