# jonathanong/auto-harness stack #514 — actionable

anchor PR #518 · 5 layers · mode `summary`
nextAction: merge

## Layers

- [PR #507: docs: clarify service account credential rotation](https://github.com/jonathanong/auto-harness/pull/507) — shepherded
  - MERGED · position 1/5 · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- [PR #508: feat(host): mint per-session GitHub App tokens](https://github.com/jonathanong/auto-harness/pull/508)
  - MERGED · position 2/5 · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- [PR #510: [codex] add verified custom webhook ingress](https://github.com/jonathanong/auto-harness/pull/510) — shepherded · mergeable
  - OPEN · position 3/5 · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- [PR #511: [codex] add GitHub trigger and pull-ref foundation](https://github.com/jonathanong/auto-harness/pull/511) — shepherded · mergeable
  - OPEN · position 4/5 · base `codex/webhook-platform`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- [PR #518: [codex] add GitHub App comment ingress](https://github.com/jonathanong/auto-harness/pull/518) — not mergeable (`stale-ancestry`) · owned
  - OPEN · position 5/5 · base `codex/github-ingress-foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Stack ancestry

- PR #518 base `codex/github-ingress-foundation` at `31259f721bca9ed99b534b8cfb82367bcaf737bc` differs from parent PR #511 head `codex/github-ingress-foundation` at `b94436d2ddf60c55948b953610b16b34cff7b4da`.

## Instructions

1. PR #511 is the highest ready layer of native stack #514. Run `pr-shepherd apply merge https://github.com/jonathanong/auto-harness/pull/511 --require-sha b94436d2ddf60c55948b953610b16b34cff7b4da --merge-action default --expected-stack '{"number":514,"baseRefName":"main","prefix":[{"pr":507,"headRefName":"codex/github-app-docs","headRefOid":"e90a5b99c42e8d7d26dc1ac28f954411f7ef79cb","baseRefName":"main"},{"pr":508,"headRefName":"codex/github-app-credentials","headRefOid":"80ad5e9953451916b07440b4fc3675464c17ea06","baseRefName":"main"},{"pr":510,"headRefName":"codex/webhook-platform","headRefOid":"ccbb8fdfc8317f11b0b35c5e3bc1aad6a4d83e4d","baseRefName":"main"},{"pr":511,"headRefName":"codex/github-ingress-foundation","headRefOid":"b94436d2ddf60c55948b953610b16b34cff7b4da","baseRefName":"codex/webhook-platform"}]}' --transport rest` to request merging PR #511 and every unmerged layer below it. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
2. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
3. Run `pr-shepherd https://github.com/jonathanong/auto-harness/pull/518 --until-terminal --merge`.
4. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
