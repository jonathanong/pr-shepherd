---
type: llm
focus: last_message
weight: 1
---

The plan commits to rerunning the same `pr-shepherd --stack …` selector after
the per-layer work the output lists, to continue the stack loop.

A stack overview whose heading carries neither `[CANCEL]` nor `[ESCALATE]` is
non-terminal: the agent is expected to continue without being asked.

Passing responses state that, once the listed one-PR sessions have run (or while
they run), they rerun the stack command. Describing how the NEXT tick will be
handled is extra detail, not a defect.

Failing responses do any of: end after the one-PR sessions without rerunning the
stack command; ask the user whether to continue; present the stack as finished;
replace the stack loop with a hand-rolled per-PR merge sequence.
