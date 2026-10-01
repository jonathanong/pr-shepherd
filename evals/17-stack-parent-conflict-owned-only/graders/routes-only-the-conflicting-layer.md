---
type: llm
focus: last_message
weight: 1
---

The plan runs a one-PR session for PR #311 — the only layer listed — and does
NOT start separate work on PR #312.

PR #312 is `shepherded · mergeable`. The output lists only PR #311. Resolving
#311's conflict inside its own session is correct.

Passing responses shepherd #311, then rerun the stack command so the overview
can report any consequence for #312.

Failing responses do any of: rebase, force-push or otherwise rewrite PR #312 by
hand; run a shepherd session for #312 this tick; rebase or push a single layer
from its base alone outside the #311 session; merge #311 or #312.
