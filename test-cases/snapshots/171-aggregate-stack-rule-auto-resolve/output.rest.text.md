# owner/repo stack #60 — actionable

anchor PR #51 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #50: Lower layer with a bot notice — shepherded · mergeable · owned
  - OPEN · base `main`
  - classification auto-resolve: minimized 1 comment (rule: coderabbit-progress)
    - pr-comment `IC_progress` https://github.com/owner/repo/pull/50#issuecomment-9
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #51: Upper layer needs work — not mergeable (`review-work`) · owned
  - OPEN · base `lower` · 1 actionable
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/51 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/51 --until-terminal --transport rest`. Keep watching until every layer is terminal.
