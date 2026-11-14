---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

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

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
