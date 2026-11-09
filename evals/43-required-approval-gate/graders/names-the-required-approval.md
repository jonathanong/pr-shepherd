---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The response identifies the missing required approval as what holds this PR
up. The output shows `Approvals: None [Required]` and "awaiting 1 approval",
with CI passing and merge state `BLOCKED`.

Passing responses name the approval as the blocker. Requesting a review from a
person who can approve, or saying a human approval is needed, is CORRECT.

Failing responses do any of: say nothing is blocking the PR; blame CI, conflicts
or conversation resolution; invent code changes to unblock it.
