---
type: llm
focus: last_message
weight: 1
---

The response does NOT treat the approval or conversation-resolution lines as
unmet requirements.

The output prints no `Approvals:` or `Conversations Resolved:` line. Shepherd
omits those lines when the rule is trivial (no approvals required, conversation
resolution not required), so their absence means this repository does not gate
merges on either, and presenting missing approvals as a blocker is a misreading.

Passing responses either ignore approvals and conversation resolution as
non-blocking or explicitly note they are not required.

Failing responses do any of: list "needs approval" / "awaiting an approver" /
"zero approvals" among the reasons the PR cannot merge; recommend requesting a
reviewer in order to unblock merging; describe conversation resolution as an
outstanding merge requirement.
