# jonathanong/auto-harness stack #514 — actionable

anchor PR #518 · 5 layers · mode `summary`
nextAction: merge

## Layers

- PR #507: docs: clarify service account credential rotation — shepherded
  - MERGED · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #508: feat(host): mint per-session GitHub App tokens
  - MERGED · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #510: [codex] add verified custom webhook ingress — shepherded · mergeable
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #511: [codex] add GitHub trigger and pull-ref foundation — shepherded · mergeable
  - OPEN · base `codex/webhook-platform` · trunk behind unknown
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #518: [codex] add GitHub App comment ingress — not mergeable (`stale-ancestry`)
  - OPEN · base `codex/github-ingress-foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Stack ancestry

- PR #518 base `codex/github-ingress-foundation` at `31259f721bca9ed99b534b8cfb82367bcaf737bc` differs from parent PR #511 head `codex/github-ingress-foundation` at `b94436d2ddf60c55948b953610b16b34cff7b4da`.

## Instructions

1. Before merging, check the top layer against trunk, because GitHub's `mergeable` compares an upper layer only with its parent layer. Shepherd could not compare trunk `main` with PR #511. From a checkout of `jonathanong/auto-harness`, run `git fetch <remote> main` (`<remote>` is the remote that points at `jonathanong/auto-harness`), then `git merge-tree --write-tree FETCH_HEAD b94436d2ddf60c55948b953610b16b34cff7b4da`. This writes no files and no refs. If it exits 0, continue with the next step. If it exits 1, it lists the conflicts: do not merge, and do not merge layer by layer. Update the whole stack from its bottom layer onto `main`, then push it. Use the repository's stack-update procedure for native stack #514 in `jonathanong/auto-harness`, starting at bottom open layer PR #510 and preserving the ordered parent boundaries of every affected upper layer. Read membership with REST-backed Shepherd `stack` output and update and push affected branches using the caller's git workflow. Playbook: "Branch update". Then rerun the stack command.
2. Run `pr-shepherd apply merge https://github.com/jonathanong/auto-harness/pull/511 --require-sha b94436d2ddf60c55948b953610b16b34cff7b4da --merge-action default --expected-stack '{"number":514,"baseRefName":"main","prefix":[{"pr":507,"headRefName":"codex/github-app-docs","headRefOid":"e90a5b99c42e8d7d26dc1ac28f954411f7ef79cb","baseRefName":"main"},{"pr":508,"headRefName":"codex/github-app-credentials","headRefOid":"80ad5e9953451916b07440b4fc3675464c17ea06","baseRefName":"main"},{"pr":510,"headRefName":"codex/webhook-platform","headRefOid":"ccbb8fdfc8317f11b0b35c5e3bc1aad6a4d83e4d","baseRefName":"main"},{"pr":511,"headRefName":"codex/github-ingress-foundation","headRefOid":"b94436d2ddf60c55948b953610b16b34cff7b4da","baseRefName":"codex/webhook-platform"}]}' --transport rest` to request merging PRs #510, #511 of native stack #514. #518 stays open above it; GitHub retargets it onto `main`. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
3. Start one concurrent one-PR session per command below; none for layers without one.
4. Run `pr-shepherd https://github.com/jonathanong/auto-harness/pull/518 --until-terminal --merge`.
5. After the merge attempt, rerun `pr-shepherd stack "jonathanong/auto-harness#514" --until-terminal --merge-ready --transport rest`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
