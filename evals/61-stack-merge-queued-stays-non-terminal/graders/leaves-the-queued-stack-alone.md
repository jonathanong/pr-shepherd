---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

Both layers are in the merge queue and READY receipts exist. The plan does not
touch them: no rebase, amend or push, no `gh stack merge` or `gh pr merge`, no
dequeue or re-enqueue, and no new one-PR sessions.

The output says "Do not rewrite a queued layer". An upper layer's READY receipt
does not mean the handoff is complete.

Failing responses do any of: merge, enqueue or dequeue any layer; push to either
branch; declare the stack finished or merged; block on a watcher such as
`gh pr checks --watch`.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
