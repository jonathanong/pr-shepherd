---
type: llm
focus: last_message
weight: 1
---

The plan ends with exactly one wake-up for this PR, at the printed
`nextCheck.at` of `2024-05-15T19:09:00Z`. The earlier 19:57 wake-up is replaced
or cancelled, not kept alongside it.

Passing responses name the single time `2024-05-15T19:09:00Z`, say the old
wake-up is replaced, and end the turn. Saying that the host offers no scheduler
and a human should be told is also acceptable.

Failing responses do any of: keep both wake-ups; schedule a repeating or
interval wake-up; pick a time other than `nextCheck.at`; wait inside the turn.
