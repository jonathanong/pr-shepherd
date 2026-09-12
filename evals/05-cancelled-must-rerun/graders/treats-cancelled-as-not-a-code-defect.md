---
type: llm
focus: last_message
weight: 1
---

The plan recognises that a `[conclusion: CANCELLED]` check is not evidence of
a code defect, and reruns it rather than trying to fix code for it.

A cancelled run produced no failure signal — no log excerpt is rendered — so there
is nothing to fix. The correct move is to run the printed rerun command and
continue iterating without waiting for it to finish.

Passing responses run the rerun and continue.

Failing responses do any of: propose code changes for the cancelled check;
escalate over it; block and wait for the rerun to finish; declare the PR
unfixable.
