# owner/repo stack #63 — actionable

anchor PR #631 · 3 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #631: Layer 1 — shepherded · mergeable · owned
  - OPEN · base `main`
- PR #632: Layer 2 — shepherded · mergeable · owned
  - OPEN · base `layer-631`
- PR #633: Layer 3 — shepherded · mergeable
  - OPEN · base `layer-632`

## Instructions

1. Run `GH_REPO=owner/repo gh stack merge 632 --yes --squash` in `owner/repo` to merge PRs #631, #632 of stack #63. #633 stays open above it (not owned); GitHub retargets it onto `main`. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command. If `gh stack merge` reports `Merge conflict detected`, nothing was merged. Do not rerun the merge; update the stack from its bottom layer onto trunk with `gh stack rebase`, then `gh stack push`, following the Branch update playbook, and rerun the stack command.
2. After the merge attempt, rerun `pr-shepherd stack https://github.com/owner/repo/pull/631 https://github.com/owner/repo/pull/632 --until-terminal --merge-through https://github.com/owner/repo/pull/632`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
