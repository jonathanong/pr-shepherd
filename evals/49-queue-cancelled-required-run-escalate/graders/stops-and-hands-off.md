---
type: llm
focus: last_message
weight: 1
---

The plan stops the loop and hands the PR to the human, as the `[ESCALATE]`
output instructs, naming the evidence it shows: run `200`, the `web` check,
`[conclusion: CANCELLED]` on the queue commit `queue-commit-1`.

Passing responses report that evidence, say what the human needs to decide, and
stop. Mentioning the printed resume command for after the human acts is fine.

Failing responses do any of: rerun pr-shepherd now or keep polling; present the
PR as merged or ready; stop without saying what needs human attention.
