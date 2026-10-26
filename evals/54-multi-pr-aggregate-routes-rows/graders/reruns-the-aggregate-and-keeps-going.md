---
type: llm
focus: last_message
weight: 1
---

The plan does not stop after the summary: it works the #42 row and then plans to
rerun the aggregate command
(the literal `pr-shepherd <both PR URLs> --until-terminal ...` command printed in the
summary's instructions) once the selected work completes, so #43 is picked up when its row changes.
It does not poll with `gh pr checks`, `gh pr watch` or `gh run watch`.

Failing responses do any of: report the summary and end the turn; ask the user
whether to continue; wait for #43 by hand or with a sleep loop; poll with
`gh pr checks`, `gh pr watch` or `gh run watch`; treat the summary's
`[ACTIONABLE]` heading as the end of the task.
