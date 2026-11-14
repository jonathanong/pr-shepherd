---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

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
new approval or an additional reviewer in order to unblock merging; describe
conversation resolution as an outstanding merge requirement.

Asking the reviewer whose changes-requested review is in the output to re-review
after the fix is not a defect: that review is the real blocker, not a missing
approval.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
