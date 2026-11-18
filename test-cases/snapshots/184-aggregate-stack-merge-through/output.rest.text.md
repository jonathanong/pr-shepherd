# owner/repo stack #63 — actionable

anchor PR #631 · 3 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #631: Layer 1 — shepherded · mergeable · owned
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #632: Layer 2 — shepherded · mergeable · owned
  - OPEN · base `layer-631`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #633: Layer 3 — shepherded · mergeable
  - OPEN · base `layer-632`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Run `pr-shepherd apply merge https://github.com/owner/repo/pull/632 --require-sha 6326326326326326326326326326326326326326 --merge-action default --expected-stack '{"number":63,"baseRefName":"main","prefix":[{"pr":631,"headRefName":"layer-631","headRefOid":"6316316316316316316316316316316316316316","baseRefName":"main"},{"pr":632,"headRefName":"layer-632","headRefOid":"6326326326326326326326326326326326326326","baseRefName":"layer-631"}]}' --transport rest` to request merging PRs #631, #632 of native stack #63. #633 stays open above it (not owned); GitHub retargets it onto `main`. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
2. After the merge attempt, rerun `pr-shepherd stack https://github.com/owner/repo/pull/631 https://github.com/owner/repo/pull/632 --until-terminal --merge-through https://github.com/owner/repo/pull/632 --transport rest`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.

## GitHub API usage

- Credential source: `GH_TOKEN`
- REST requests without rate-limit headers (unmetered): 1
