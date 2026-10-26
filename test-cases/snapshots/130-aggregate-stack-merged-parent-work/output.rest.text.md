# vouchington/vouchington stack #2535 — actionable

anchor PR #2547 · 6 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #2509: Hashtags bounds
  - MERGED · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #2534: Hostname flags NOT NULL
  - MERGED · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #2547: Hostname dispatcher — not mergeable (`conflicting`) · owned
  - OPEN · base `fix/2429-hostname-flags-not-null`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #2569: Bloom rebuilds and backfills — not mergeable (`review-work`) · owned
  - OPEN · base `fix/1855-crawl-hostnames-dispatcher` · 1 actionable
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #2627: UUID media registry and paged async replay — not mergeable (`review-work`) · owned
  - OPEN · base `fix/1855-bloom-reconciliation` · 1 actionable
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #2629: Image projection view and hydration budgets — not mergeable (`review-work`) · owned
  - OPEN · base `fix/2508-media-delivery-registry-ids` · 1 actionable
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2547 --until-terminal`.
3. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2569 --until-terminal`.
4. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2627 --until-terminal`.
5. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2629 --until-terminal`.
6. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/vouchington/vouchington/pull/2547 --until-terminal --ready-delay 0s --stall-timeout 3600s --transport rest`. Do not end the turn while any layer is non-terminal: a one-PR session returning `CANCEL` or `ESCALATE` finishes only that layer, and merged, `CANCEL`, `ESCALATE`, or handed-off layers do not count.
