# owner/repo stack #36 — actionable

Stack: #36 · anchor PR #352 · 2 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- [PR #351: Queued foundation](https://github.com/owner/repo/pull/351) — shepherded · mergeable
  - OPEN · position 1/2 · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- [PR #352: Queued child](https://github.com/owner/repo/pull/352) — shepherded · mergeable
  - OPEN · position 2/2 · base `foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. PR #352 is the highest ready layer of native stack #36. Run `pr-shepherd apply merge https://github.com/owner/repo/pull/352 --require-sha f222222222222222222222222222222222222222 --merge-action default --expected-stack '{"number":36,"baseRefName":"main","prefix":[{"pr":351,"headRefName":"foundation","headRefOid":"f111111111111111111111111111111111111111","baseRefName":"main"},{"pr":352,"headRefName":"child","headRefOid":"f222222222222222222222222222222222222222","baseRefName":"foundation"}]}' --transport rest` to request merging PR #352 and every unmerged layer below it. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
2. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
