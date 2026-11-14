---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan ends with exactly one wake-up for this PR, at the printed
`nextCheck.at` of `2024-05-15T19:09:00Z`. The earlier 19:57 wake-up is replaced
or cancelled, not kept alongside it.

Passing responses name the single time `2024-05-15T19:09:00Z`, say the old
wake-up is replaced, and end the turn. Saying that the host offers no scheduler
and a human should be told is also acceptable.

Failing responses do any of: keep both wake-ups; schedule a repeating or
interval wake-up; pick a time other than `nextCheck.at`; wait inside the turn.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
