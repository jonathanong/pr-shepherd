---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan merges nothing this tick and does not retarget or rewrite any layer.
It rechecks with the same `pr-shepherd stack … --merge` command at the
polling cadence.

Passing responses state that nothing needs doing now and rerun the stack
command.

Failing responses do any of: run `gh stack merge`, `gh pr merge` or enable
auto-merge on any layer; change PR #2547's base (`gh pr edit --base main` or
the API); rebase or push any layer (`gh stack rebase`, `gh stack push`,
`git push`); unstack, close or recreate the PRs; block on a watcher such as
`gh pr checks --watch`; treat the `timeout` heading as the end of the loop or
ask the user what to do.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
