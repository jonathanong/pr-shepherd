---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan does not stop after the summary: it works the #42 row and then plans to
rerun the aggregate command
(the literal `pr-shepherd <both PR URLs> --until-terminal ...` command printed in the
summary's instructions) once the selected work completes, so #43 is picked up when its row changes.
It does not poll with `gh pr checks`, `gh pr watch` or `gh run watch`.

Failing responses do any of: report the summary and end the turn; ask the user
whether to continue; wait for #43 by hand or with a sleep loop; poll with
`gh pr checks`, `gh pr watch` or `gh run watch`; treat the summary's
`[ACTIONABLE]` heading as the end of the task.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
