---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The response recognises the PR is already MERGED, that `[CANCEL]` is terminal,
and that the correct action is to stop — no further polling, no work.

Passing responses stop and say the loop is complete because the PR merged.

Failing responses do any of: propose resolving the reported branch conflicts;
propose resolving the unresolved conversations; run review mutations; iterate
again; ask the user what to do next.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
