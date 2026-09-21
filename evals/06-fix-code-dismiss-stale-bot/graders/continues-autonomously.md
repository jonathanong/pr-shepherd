---
type: llm
focus: last_message
weight: 1
---

The response treats `[FIX_CODE]` as non-terminal. It evaluates the surfaced
review bodies, makes any warranted code fixes, runs the generated authorized
review mutation with a current pushed head SHA and a truthful disposition, then
iterates Shepherd again. It does not ask a human to dismiss an authorized bot
review just because the review is old.
