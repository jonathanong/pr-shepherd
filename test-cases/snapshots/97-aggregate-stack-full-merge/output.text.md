# owner/repo stack #35 — actionable

anchor PR #342 · 2 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #341: Verified foundation — shepherded · mergeable
  - OPEN · base `main`
- PR #342: Verified child — shepherded · mergeable
  - OPEN · base `foundation`

## Instructions

1. Run `GH_REPO=owner/repo gh stack merge 342 --yes --squash` in `owner/repo` to merge PRs #341, #342 of stack #35. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command.
2. After the merge attempt, rerun `pr-shepherd stack "owner/repo#35" --until-terminal --merge`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
