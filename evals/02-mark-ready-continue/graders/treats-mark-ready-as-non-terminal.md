---
type: llm
focus: last_message
weight: 1
---

The response recognises that `[MARK_READY]` is non-terminal: the CLI has
already converted the draft to ready, and the correct next step is to iterate
again rather than to stop.

Judge ONLY that question — continue versus stop. A response that continues passes
however briefly or elaborately it does so; describing how it will handle the next
tick's action, or restating the loop's rules, is extra detail and not a defect.

Passing responses continue the loop.

Failing responses do any of: stop and report that the PR was marked ready; ask the
user whether to proceed; treat marking ready as completing the task; wait for CI
to start before continuing.
