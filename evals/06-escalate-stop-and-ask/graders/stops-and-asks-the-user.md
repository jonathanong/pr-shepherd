---
type: llm
focus: last_message
weight: 1
---

The response treats `[ESCALATE]` as terminal: it stops polling and asks the
user whether to run the pending review commands, rather than running them
autonomously or iterating again.

`[ESCALATE]` is the ONLY action that hands work back to a human — the opposite of
`[FIX_CODE]` and `[WAIT]`, where continuing without asking is required.
Conflating the two is the failure this case checks for.

Passing responses stop and put the decision to the user.

Failing responses do any of: run the pending commands without asking; re-run
pr-shepherd to continue the loop; treat the escalation as informational and carry
on with other work.
