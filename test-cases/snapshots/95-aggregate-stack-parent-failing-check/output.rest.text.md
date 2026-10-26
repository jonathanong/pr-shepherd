# owner/repo stack #33 — actionable

anchor PR #322 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #321: CI failure — not mergeable (`failing-checks`) · owned
  - OPEN · base `main` · 1 failing
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #322: Verified child — shepherded · mergeable
  - OPEN · base `foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/321 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/322 --until-terminal --ready-delay 0s --stall-timeout 3600s --transport rest`. Do not end the turn while any layer is non-terminal: a one-PR session returning `CANCEL` or `ESCALATE` finishes only that layer, and merged, `CANCEL`, `ESCALATE`, or handed-off layers do not count.
