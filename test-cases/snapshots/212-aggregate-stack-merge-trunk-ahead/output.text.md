# owner/repo stack #36 — actionable

anchor PR #351 · 3 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #351: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
- PR #352: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-351`
- PR #353: Layer 3 — shepherded · mergeable
  - OPEN · base `layer-352` · trunk behind 1

## Instructions

1. Before merging, check the top layer against trunk, because GitHub's `mergeable` compares an upper layer only with its parent layer. Trunk `main` has 1 commit that PR #353 lacks. From a checkout of `owner/repo`, run `git fetch <remote> main` (`<remote>` is the remote that points at `owner/repo`), then `git merge-tree --write-tree FETCH_HEAD e333333333333333333333333333333333333333`. This writes no files and no refs. If it exits 0, continue with the next step. If it exits 1, it lists the conflicts: do not merge, and do not merge layer by layer. Update the whole stack from its bottom layer onto `main`, then push it. From a clean checkout of `owner/repo`, if `gh stack` does not track stack #36 locally, import it with `gh stack checkout 36`. Then check out the head branch of PR #351 and run `gh stack rebase`. Playbook: "Branch update". Then rerun the stack command.
2. Run `GH_REPO=owner/repo gh stack merge 353 --yes --squash` in `owner/repo` to merge PRs #351, #352, #353 of stack #36. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command. If `gh stack merge` reports `Merge conflict detected`, nothing was merged. Do not rerun the merge; update the stack from its bottom layer onto trunk with `gh stack rebase`, then `gh stack push`, following the Branch update playbook, and rerun the stack command.
3. After the merge attempt, rerun `pr-shepherd stack "owner/repo#36" --until-terminal --merge`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
