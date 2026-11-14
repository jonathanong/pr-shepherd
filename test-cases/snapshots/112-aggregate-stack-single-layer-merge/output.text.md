# owner/repo stack #50 — actionable

anchor PR #501 · 1 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #501: Verified single layer — shepherded · mergeable
  - OPEN · base `main`

## Instructions

1. Run `GH_REPO=owner/repo gh stack merge 501 --yes --squash` in `owner/repo` to merge PR #501 alone of stack #50. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command.
2. After the merge attempt, rerun `pr-shepherd stack "owner/repo#50" --until-terminal --merge`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
