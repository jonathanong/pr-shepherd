# Stack merge

Apply when a step says `Playbook: "Stack merge"`. The CLI prints the merge command. Do not rebase or push.

- If `gh stack` is an unknown command, run `gh extension install github/gh-stack` first.
- A merge-queue base queues the printed prefix together and evaluates each layer from the bottom. A failure ejects that layer and the layers above it.
- Do not run `gh stack push`. A stale local layer would overwrite newer remote commits.
