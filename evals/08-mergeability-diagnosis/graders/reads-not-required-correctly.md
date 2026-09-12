---
type: llm
focus: last_message
weight: 1
---

The response does NOT treat the approval or conversation-resolution lines as
unmet requirements.

The output states `Approvals: None [Not Required]` and `Conversations Resolved:
Yes [Not Required]`. The `[Not Required]` marker means this repository does not
gate merges on either, so "None" approvals is not a blocker and presenting it as
one is a misreading.

Passing responses either ignore those lines as non-blocking or explicitly note
they are not required.

Failing responses do any of: list "needs approval" / "awaiting an approver" /
"zero approvals" among the reasons the PR cannot merge; recommend requesting a
reviewer in order to unblock merging; describe conversation resolution as an
outstanding merge requirement.
