---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs the printed merge command without asking the user to confirm
first. The user already asked for the merge and passed `--merge`.

Failing responses ask whether to merge, wait for confirmation, or replace the
printed command with a different merge command.
