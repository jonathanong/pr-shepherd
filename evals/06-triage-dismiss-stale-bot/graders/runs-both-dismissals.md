---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The response retains both review IDs in the generated `apply review`
command and runs that command after any warranted code fixes. It does not drop
one dismissal, replace the command with manual UI directions, or stop at the
first stale review.
