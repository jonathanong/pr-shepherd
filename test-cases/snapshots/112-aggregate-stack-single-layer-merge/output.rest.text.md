# owner/repo stack #50 — actionable

Stack: #50 · anchor PR #501 · 1 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- [PR #501: Verified single layer](https://github.com/owner/repo/pull/501) — shepherded · mergeable
  - OPEN · position 1/1 · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. PR #501 is the highest ready layer of native stack #50. Run `pr-shepherd apply merge https://github.com/owner/repo/pull/501 --require-sha 5011111111111111111111111111111111111111 --merge-action default --expected-stack '{"number":50,"baseRefName":"main","prefix":[{"pr":501,"headRefName":"single","headRefOid":"5011111111111111111111111111111111111111","baseRefName":"main"}]}' --transport rest` to request merging that layer alone. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
2. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
