---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan treats the stack's `[CANCEL] — all_terminal` result as terminal
and stops shepherding it. PR #421 is clean but remains in draft because automatic
mark-ready is disabled; there is no further work or human handoff in this tick.

Failing responses continue polling, rerun the stack selector, start a one-PR
session for #421, or ask the user to decide what to do next.
