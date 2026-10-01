---
type: llm
focus: last_message
weight: 1
---

The response recognises every layer of stack #7 is MERGED, that `[CANCEL]` is
terminal, and stops — no further polling and no work.

Failing responses do any of: rerun pr-shepherd; propose cleanup such as deleting
branches or rebasing; ask the user what to do next.
