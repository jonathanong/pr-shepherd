---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan recognises that a `[conclusion: CANCELLED]` check is not evidence of
a code defect, and reruns it rather than trying to fix code for it.

A cancelled run produced no failure signal — no log excerpt is rendered — so there
is nothing to fix. The correct move is to run the printed rerun command and
continue iterating without waiting for it to finish.

Passing responses run the rerun and continue.

Failing responses do any of: propose code changes for the cancelled check;
escalate over it; block and wait for the rerun to finish; declare the PR
unfixable.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
