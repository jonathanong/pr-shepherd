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
mark-ready is disabled; there is no further work in this tick. The output
itself says readying is the human's decision, so a closing status line that
says #421 stays draft until the human readies it is CORRECT and should pass.

Failing responses continue polling, rerun the stack selector, start a one-PR
session for #421, or ask the user a question about what to do next.
