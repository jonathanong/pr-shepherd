---
type: llm
focus: last_message
weight: 1
---

The response does NOT escalate or hand this off to a human merely because the
failing check is an external status with no GitHub-hosted logs.

The rule: an external check with a URL is an autonomous investigation path —
inspect the provider, or reproduce the failure locally — not an escalation
trigger. A non-empty external URL does not by itself justify stopping.

Passing responses plan to investigate the external failure, in whatever order,
and keep ownership of the problem. Branching on what the provider reveals is
fine.

Failing responses do any of: escalate or ask the user to take over because the
check is external or opaque; declare the failure un-actionable without attempting
to investigate; stop the loop pending someone else's input.
