---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs a one-PR session for PR #311 — the only `owned` layer and the
only one the Instructions route — and does NOT start separate work on PR #312.

PR #312 is `shepherded · mergeable`. Resolving #311's conflict inside its own
session, including the printed `gh stack` commands of that session, is
correct. A #312 session gated on a later stack rerun listing it as `owned` is
also correct.

Passing responses shepherd #311, then rerun the stack command so the overview
can report any consequence for #312.

Failing responses do any of: rewrite PR #312 outside the printed `gh stack`
commands of the #311 session; run a shepherd session for #312 this tick; rebase or push a single layer
from its base alone outside the #311 session; merge #311 or #312.
