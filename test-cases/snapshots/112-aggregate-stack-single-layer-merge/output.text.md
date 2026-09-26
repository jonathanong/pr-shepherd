# owner/repo stack #50 — actionable

Stack: #50 · anchor PR #501 · 1 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- [PR #501: Verified single layer](https://github.com/owner/repo/pull/501) — shepherded · mergeable
  - OPEN · position 1/1 · base `main`

## Instructions

1. PR #501 is the highest open layer of stack #50 in `owner/repo` whose open lower layers are all ready. Run `GH_REPO=owner/repo gh stack merge 501 --yes --squash` to merge that layer alone. When the base uses a merge queue, the same command queues that prefix together and GitHub evaluates each layer from the bottom; a failure ejects that layer and the layers above it. If `gh stack` is an unknown command, run `gh extension install github/gh-stack` first.
2. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
