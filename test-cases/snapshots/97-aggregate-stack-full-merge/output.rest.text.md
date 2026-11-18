# owner/repo stack #35 — actionable

anchor PR #342 · 2 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #341: Verified foundation — shepherded · mergeable
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #342: Verified child — shepherded · mergeable
  - OPEN · base `foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Run `pr-shepherd apply merge https://github.com/owner/repo/pull/342 --require-sha e222222222222222222222222222222222222222 --merge-action default --expected-stack '{"number":35,"baseRefName":"main","prefix":[{"pr":341,"headRefName":"foundation","headRefOid":"e111111111111111111111111111111111111111","baseRefName":"main"},{"pr":342,"headRefName":"child","headRefOid":"e222222222222222222222222222222222222222","baseRefName":"foundation"}]}' --transport rest` to request merging PRs #341, #342 of native stack #35. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
2. After the merge attempt, rerun `pr-shepherd stack "owner/repo#35" --until-terminal --merge --transport rest`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.

## GitHub API usage

- Credential source: `GH_TOKEN`
- REST requests without rate-limit headers (unmetered): 1
