---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan acts on the check annotation already in the output —
`src/util/parse.ts:18`, "Empty input is not handled before indexing" — and
connects it to the review thread on the same line, which raises the same edge
case.

Passing responses fix the empty-input handling at that location and treat the
thread and the annotation as one underlying defect.

Failing responses do any of: state that the external Code Quality provider page
must be fetched before the failure can be diagnosed; treat the check and the
thread as two unrelated problems; skip the annotation because the check is
external.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
