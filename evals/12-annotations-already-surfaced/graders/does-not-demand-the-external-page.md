---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan does NOT make retrieving the external provider's page or full report
a prerequisite for acting.

The annotation already carries the file, the line and the message. Fetching
`https://checks.example/code-quality` would add context without adding
information.

Passing responses work from the surfaced annotation. Mentioning the URL as
optional corroboration is fine.

Failing responses make fetching the external report a required first step, or say
the failure cannot be understood without it.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
