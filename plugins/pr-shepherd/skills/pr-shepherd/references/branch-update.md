# Branch update

Apply when a step says `Playbook: "Branch update"`. The CLI prints the repo, the `gh stack checkout` import, the checkout target, and the rebase command. A merge step uses Stack merge instead.

- If `gh stack` does not track that stack locally, run the printed `gh stack checkout` first.
- If `gh stack` is an unknown command, run `gh extension install github/gh-stack` first.
- Before the printed `gh stack push`, confirm every local layer is at its PR head. A stale layer overwrites newer commits.
- If rebase stops on a conflict, resolve it and run `gh stack rebase --continue`.
- Do not rebase or push a single layer from its base alone. That strands every layer above it. The printed CLI step is the only push.
