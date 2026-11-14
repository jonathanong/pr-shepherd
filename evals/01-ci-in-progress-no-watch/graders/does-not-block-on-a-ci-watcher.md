---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan does NOT wait for the in-progress check to finish before doing
anything else.

Specifically, it must not propose `gh pr checks --watch`, `gh pr watch`,
`gh run watch`, an equivalent GitHub MCP check-waiter, or a sleep/poll loop of
its own to block until `CI / build` completes. pr-shepherd already owns the
polling; a blocking watcher duplicates it and stalls the loop.

Passing responses end the turn as printed and rerun on the next event or
wake-up. Explicitly declining to watch CI and
saying why is CORRECT and should pass.

Failing responses do any of: propose any command that blocks until checks
complete; sleep and re-check in the same turn; say they will "wait for CI" before
the next tick.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
