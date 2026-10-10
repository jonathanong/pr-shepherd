---
type: llm
focus: last_message
weight: 1
---

The response identifies the missing required approval as what holds this PR
up. The output shows `Approvals: None [Required]` and "awaiting 1 approval",
with CI passing and merge state `BLOCKED`.

Passing responses name the approval as the blocker. Requesting a review from a
person who can approve, or saying a human approval is needed, is CORRECT.

Failing responses do any of: say nothing is blocking the PR; blame CI, conflicts
or conversation resolution; invent code changes to unblock it.
