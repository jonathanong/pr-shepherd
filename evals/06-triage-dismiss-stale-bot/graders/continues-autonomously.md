---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The response treats `[TRIAGE]` as non-terminal. It evaluates the surfaced
review bodies, makes any warranted code fixes, runs the generated authorized
review mutation with a current pushed head SHA and a truthful disposition, then
iterates Shepherd again. It does not ask a human to dismiss an authorized bot
review just because the review is old.
