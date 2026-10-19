---
type: llm
focus: last_message
weight: 1
---

The plan commits to running pr-shepherd again to continue the loop, rather than
stopping to report, to ask permission, or to wait for something.

Only `[ESCALATE]` hands work back to a human, and only `[CANCEL]` ends the loop.
Every other action — including this one — is non-terminal, and the agent is
expected to continue without being asked.

The POSITION of that step does not matter. Where there is no work to do first,
re-running immediately as step 1 is correct and should pass; where work must
happen first, iterating after it is correct and should pass. A plan that also
describes how it will dispatch on the NEXT tick's action still passes — extra
detail is not a defect.

Passing responses state somewhere that they iterate / re-run pr-shepherd with the
same options to continue.

Failing responses do any of: end by asking the user whether to continue; present
the work as finished; stop to write a status report; wait for something before
the next tick; treat a push as the end of the loop.
