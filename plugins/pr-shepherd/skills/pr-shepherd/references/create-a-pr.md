# Create a PR

Apply when the user asks to make, create, or open a PR, before dispatching.

- Before creating any PR, split the work into one PR per change that can be reviewed alone and choose each base. Stack a PR on an earlier one when it needs that PR's code or edits the same lines (it would need a rebase once the earlier one merges); otherwise base it on the default branch. When such a branch was cut from the default branch, rebase it onto the earlier branch first and push it with `--force-with-lease`; it is your own branch. Then shepherd every PR until it is mergeable: `pr-shepherd stack <top PR>` for a stack, one `pr-shepherd` run listing the separate PRs otherwise.
- Review and commit the in-scope changes, verify the push remote and the chosen base, push each branch, create each PR (stacked PRs through `gh stack`, below), and pass the qualified URLs to Dispatch.
- Push is the ordinary non-force push of those reviewed commits. Do not ask for a separate confirmation because the push publishes them. Request runtime escalation when the host requires it.
- A skill cannot grant host permissions. Unattended approval comes from a trusted command rule or host policy.
- Rebasing your own PR head onto its base and pushing it with `--force-with-lease` is also part of this workflow. Do not ask first.
- Bare `--force`, pushes to any other branch, remote or credential changes, unrelated changes, and ambiguous targets stay outside this workflow.
- Creating or opening a PR without merge intent leaves `--merge` off.
- To stack, create a GitHub native stack with `gh stack` instead of pointing branches at each other by hand: `gh extension install github/gh-stack`, `gh stack init <branch>`, `gh stack add <branch>`, `gh stack submit --auto`. When the earlier PR is already open, add the new branch with `gh stack link <earlier PR> <new branch>` (or `gh stack link <stack number> <new branch>` when it is already in a stack), not `gh pr create --base <earlier branch>`. If `gh stack` reports stacks are unavailable, open separate PRs on the default branch and merge them in order.
- Merge a native stack with one `gh stack merge <top PR>` (or the merge Shepherd prints), which lands every layer below it; do not `gh pr merge` layer by layer and rebase between merges.
