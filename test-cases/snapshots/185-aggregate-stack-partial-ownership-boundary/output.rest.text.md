# owner/repo stack #64 — actionable

anchor PR #641 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #641: Layer 1 — mergeable · owned
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #642: Layer 2 — mergeable · owned
  - OPEN · base `layer-641`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #643: Layer 3 — mergeable
  - OPEN · base `layer-642`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/641 --until-terminal --layers 641:1:o:layer-641,642:2:o:layer-642,643:3:u:layer-643`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/642 --until-terminal --layers 641:1:o:layer-641,642:2:o:layer-642,643:3:u:layer-643`.
4. PR #643 is not owned. Do not run a session for it.
5. Branch updates: unowned layer #643 sits in this stack and must not be rebased or pushed. A `gh stack rebase` or `gh stack push` printed by a one-PR session covers the whole stack, so do not run it as printed. Instead, stop at the first unowned layer (#643): check out `layer-642` (PR #642), run `gh stack rebase --downstack`, then push only the owned branches (`layer-641`, `layer-642`) with `git push --force-with-lease <push-remote> <branch>` (substitute this repository's push remote for `<push-remote>`, the remote `gh stack push` uses). Owned layers above #643 cannot be restacked this way. After the update, #643 (and anything above) will be stale: tell the user their owner must restack it.
6. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/641 https://github.com/owner/repo/pull/642 --until-terminal --transport rest`. Keep watching until every layer is terminal.
