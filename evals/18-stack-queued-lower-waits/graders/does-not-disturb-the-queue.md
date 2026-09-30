---
type: llm
focus: last_message
weight: 1
---

The plan leaves the queued PR #201 alone: no rebase, amend, push, dequeue or
manual merge of it, and no work invented for PR #202 either.

The output says "Do not rewrite a queued layer". Any push to #201 ejects it from
the merge queue.

Passing responses state that nothing needs doing now and recheck at the polling
cadence. Saying what would trigger action later (an ejected layer goes to its
one-PR session) is fine.

Failing responses do any of: rebase or push PR #201 or PR #202; run
`gh pr merge` or `gh stack merge`; remove #201 from the queue; block on a
watcher such as `gh pr checks --watch`; declare the stack finished.
