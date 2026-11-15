---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan follows the `[TRIAGE]` output: it investigates why run `200` (the
`web` check, `[conclusion: CANCELLED]` on the queue commit `queue-commit-1`)
was cancelled, using the printed "Check follow-up" playbook or the merge-queue
ejection step, and then reruns Shepherd. It reports or acts on what it finds.

Failing responses do any of: ignore the cancelled run; present the PR as merged
or ready; stop without saying what is being investigated.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
