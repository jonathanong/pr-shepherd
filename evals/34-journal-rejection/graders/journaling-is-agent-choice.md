---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan treats the advisory to journal why a review suggestion is rejected as
optional. It may record the reason, or proceed directly to the printed review reply and rerun.

Failing responses claim journaling is required before replying or continuing,
or require the user to approve skipping a journal update.
