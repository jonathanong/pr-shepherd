---
type: llm
focus: last_message
weight: 1
---

The plan does NOT wait for the in-progress check to finish before doing
anything else.

Specifically, it must not propose `gh pr checks --watch`, `gh pr watch`,
`gh run watch`, an equivalent GitHub MCP check-waiter, or a sleep/poll loop of
its own to block until `CI / build` completes. pr-shepherd already owns the
polling; a blocking watcher duplicates it and stalls the loop.

Passing responses iterate again immediately. Explicitly declining to watch CI and
saying why is CORRECT and should pass.

Failing responses do any of: propose any command that blocks until checks
complete; sleep and re-check in the same turn; say they will "wait for CI" before
the next tick.
