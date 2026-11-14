# owner/repo stack #60 — actionable

anchor PR #601 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #601: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #602: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-601`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #603: Layer 3 — mergeable
  - OPEN · base `layer-602`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Start one concurrent one-PR session per command below; none for layers without one.
2. Run `pr-shepherd https://github.com/owner/repo/pull/603 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack "owner/repo#60" --until-terminal --merge --transport rest`. Keep watching until every layer is terminal.
4. Owned layers #601, #602 are ready, but #603 (action triage; reasons review-work) is not. Nothing was merged because `--merge` lands every layer in scope together. Tell the user the lower layers are ready. Only if the user asked to merge layers as they become ready, rerun `pr-shepherd stack "owner/repo#60" --until-terminal --merge-ready --transport rest`; otherwise keep shepherding.
