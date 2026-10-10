---
type: llm
focus: last_message
weight: 1
---

The plan runs the printed merge command without asking the user to confirm
first. The user already asked for the merge and passed `--merge`.

Failing responses ask whether to merge, wait for confirmation, or replace the
printed command with a different merge command.
