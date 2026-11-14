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
review mutation as printed (its `--require-sha HEAD` pins the current pushed head;
no literal SHA is needed) with a truthful disposition, then
iterates Shepherd again. It does not ask a human to dismiss an authorized bot
review just because the review is old.
