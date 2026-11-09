---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

Both layers are in the merge queue and READY receipts exist. The plan does not
touch them: no rebase, amend or push, no `gh stack merge` or `gh pr merge`, no
dequeue or re-enqueue, and no new one-PR sessions.

The output says "Do not rewrite a queued layer". An upper layer's READY receipt
does not mean the handoff is complete.

Failing responses do any of: merge, enqueue or dequeue any layer; push to either
branch; declare the stack finished or merged; block on a watcher such as
`gh pr checks --watch`.
