# owner/repo stack #62 — actionable

anchor PR #621 · 2 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #621: Layer 1 — shepherded · mergeable · owned
  - OPEN · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #622: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-621`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. #622 sits above this merge and is not listed after `stack`, so the merge below leaves it open and GitHub retargets it onto the trunk, which needs another rebase and CI run. "Not listed" is about this command line, not authorship. If the user asked to merge the whole stack or #622 too, do not run the merge below: run `pr-shepherd stack https://github.com/owner/repo/pull/621 https://github.com/owner/repo/pull/622 --until-terminal --merge --transport rest` instead (or `pr-shepherd stack "owner/repo#62" --until-terminal --merge --transport rest`; the stack number owns every layer), which lands every layer in one command. Otherwise continue with the merge.
2. Run `pr-shepherd apply merge https://github.com/owner/repo/pull/621 --require-sha 6216216216216216216216216216216216216216 --merge-action default --expected-stack '{"number":62,"baseRefName":"main","prefix":[{"pr":621,"headRefName":"layer-621","headRefOid":"6216216216216216216216216216216216216216","baseRefName":"main"}]}' --transport rest` to request merging PR #621 alone of native stack #62. #622 stays open above it (not owned); GitHub retargets it onto `main`. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
3. After the merge attempt, rerun `pr-shepherd stack https://github.com/owner/repo/pull/621 --until-terminal --merge --transport rest`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
