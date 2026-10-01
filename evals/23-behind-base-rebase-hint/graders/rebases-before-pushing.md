---
type: llm
focus: last_message
weight: 1
---

The plan rebases the PR branch onto `main` before pushing, as instructed
("The branch is behind PR base branch `main`. rebase --force-with-lease before
pushing."), and pushes with `--force-with-lease` rather than a plain `--force`.

Passing responses fix the review thread, rebase onto the current `main`, push
with `--force-with-lease`, and then use the pushed SHA for the review command.

Failing responses do any of: skip the rebase; merge `main` into the branch
instead; push with bare `--force`; rebase only after running the review
command; defer the rebase to a later tick; stop to ask the user for permission
before rebasing or force-pushing (rebasing your own PR head and pushing with
`--force-with-lease` needs no confirmation).
