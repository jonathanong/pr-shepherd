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

1. Start one concurrent one-PR session per command below, only for `owned` rows; none for layers without one.
2. PR #401 is not owned. Do not run a session for it.
3. Run `pr-shepherd https://github.com/owner/repo/pull/402 --until-terminal --layers 401:1:u:foundation,402:2:o:review-work,403:3:o:pending-ci`.
4. Run `pr-shepherd https://github.com/owner/repo/pull/403 --until-terminal --layers 401:1:u:foundation,402:2:o:review-work,403:3:o:pending-ci`.
5. Branch updates: unowned layer #401 sits in this stack and must not be rebased or pushed. A `gh stack rebase` or `gh stack push` printed by a one-PR session covers the whole stack, so do not run it as printed. No owned layer sits below the first unowned layer (#401), so no owned branch can be restacked without rewriting it. Do not rebase or push; report that the owned layers wait on #401's owner.
6. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/402 https://github.com/owner/repo/pull/403 --until-terminal --transport rest`. Keep watching until every layer is terminal.
