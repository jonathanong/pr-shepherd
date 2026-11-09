---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The response treats `[TRIAGE]` as non-terminal, evaluates the review
thread and bot review, applies warranted code fixes, retains the generated
thread reply and bot dismissal, then iterates. It does not hand the authorized
dismissal to a human or silently abandon the actionable thread.
