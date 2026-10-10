# owner/repo stack #35 — actionable

anchor PR #342 · 2 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- [PR #341: Verified foundation](https://github.com/owner/repo/pull/341) — shepherded · mergeable
  - OPEN · merge queue required · position 1/2 · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- [PR #342: Verified child](https://github.com/owner/repo/pull/342) — shepherded · mergeable
  - OPEN · merge queue required · position 2/2 · base `foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. PR #342 is the highest ready layer of native stack #35. Run `pr-shepherd apply merge https://github.com/owner/repo/pull/342 --require-sha e222222222222222222222222222222222222222 --merge-action merge_queue --expected-stack '{"number":35,"baseRefName":"main","prefix":[{"pr":341,"headRefName":"foundation","headRefOid":"e111111111111111111111111111111111111111","baseRefName":"main"},{"pr":342,"headRefName":"child","headRefOid":"e222222222222222222222222222222222222222","baseRefName":"foundation"}]}' --transport rest` to request merging PR #342 and every unmerged layer below it. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
2. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
