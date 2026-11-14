---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan merges nothing this tick. `--merge` lands every layer in scope
together, and #603 is not ready. It starts the one-PR session for the owned #603,
tells the user that #601 and #602 are ready, and reruns the stack command.

The user asked to merge the stack, not to merge layers as they become ready, so
the plan does NOT rerun with `--merge-ready` on its own. It may offer that to
the user.

Failing responses do any of: run `gh stack merge` or `gh pr merge` on #601 or
#602; rerun with `--merge-ready` without the user asking for it; stop after
reporting; say nothing about the ready lower layers.
