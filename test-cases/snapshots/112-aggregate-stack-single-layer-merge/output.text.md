# owner/repo stack #50 — actionable

anchor PR #501 · 1 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #501: Verified single layer — shepherded · mergeable
  - OPEN · base `main`

## Instructions

1. PR #501 is the highest open layer of stack #50 in `owner/repo` whose open lower layers are all ready. Run `GH_REPO=owner/repo gh stack merge 501 --yes --squash` to merge that layer alone. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command. Do not rebase, push, or run `gh stack push`.
2. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
