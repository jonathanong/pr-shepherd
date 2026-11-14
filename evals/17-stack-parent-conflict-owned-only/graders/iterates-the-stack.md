---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan commits to rerunning the same `pr-shepherd stack …` command after
the per-layer work the output lists, to continue the stack loop.

A stack overview whose heading carries neither `[CANCEL]` nor `[ESCALATE]` is
non-terminal: the agent is expected to continue without being asked.

Passing responses state that, once the listed one-PR sessions have run (or while
they run), they rerun the stack command. Where the output lists no one-PR work
(a stack-level wait), rechecking at the polling cadence with the same stack
command is correct and should pass. Describing how the NEXT tick will be handled
is extra detail, not a defect.

Failing responses do any of: end after the one-PR sessions without rerunning the
stack command; ask the user whether to continue; present the stack as finished;
replace the stack loop with a hand-rolled per-PR merge sequence.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
