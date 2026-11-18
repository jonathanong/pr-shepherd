# owner/repo stack #36 — actionable

anchor PR #351 · 3 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #351: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #352: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-351`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #353: Layer 3 — shepherded · mergeable
  - OPEN · base `layer-352` · trunk behind 1
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. Before merging, check the top layer against trunk, because GitHub's `mergeable` compares an upper layer only with its parent layer. Trunk `main` has 1 commit that PR #353 lacks. From a checkout of `owner/repo`, run `git fetch <remote> main` (`<remote>` is the remote that points at `owner/repo`), then `git merge-tree --write-tree FETCH_HEAD e333333333333333333333333333333333333333`. This writes no files and no refs. If it exits 0, continue with the next step. If it exits 1, it lists the conflicts: do not merge, and do not merge layer by layer. Update the whole stack from its bottom layer onto `main`, then push it. Use the repository's stack-update procedure for native stack #36 in `owner/repo`, starting at bottom open layer PR #351 and preserving the ordered parent boundaries of every affected upper layer. Read membership with REST-backed Shepherd `stack` output and update and push affected branches using the caller's git workflow. Playbook: "Branch update". Then rerun the stack command.
2. Run `pr-shepherd apply merge https://github.com/owner/repo/pull/353 --require-sha e333333333333333333333333333333333333333 --merge-action default --expected-stack '{"number":36,"baseRefName":"main","prefix":[{"pr":351,"headRefName":"layer-351","headRefOid":"e111111111111111111111111111111111111111","baseRefName":"main"},{"pr":352,"headRefName":"layer-352","headRefOid":"e222222222222222222222222222222222222222","baseRefName":"layer-351"},{"pr":353,"headRefName":"layer-353","headRefOid":"e333333333333333333333333333333333333333","baseRefName":"layer-352"}]}' --transport rest` to request merging PRs #351, #352, #353 of native stack #36. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
3. After the merge attempt, rerun `pr-shepherd stack "owner/repo#36" --until-terminal --merge --transport rest`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.

## GitHub API usage

- Credential source: `GH_TOKEN`
- REST requests without rate-limit headers (unmetered): 1
