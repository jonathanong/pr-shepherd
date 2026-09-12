---
type: llm
focus: last_message
weight: 1
---

The response recognises that `[WAIT]` means there is nothing to do this tick,
that the correct next step is to iterate again, and it characterises the PR's
state correctly.

The output reads `**summary** 1 passing · **remainingSeconds** 600` and
`WAIT: 1 passing, 0 in-progress`. So: one check has PASSED, nothing is running,
and the 600 seconds is the ready-delay countdown — NOT a CI job in flight. There
are no review threads, no comments and no failing checks.

Passing responses say no action is needed now and that they will continue, and do
not misdescribe the state.

Failing responses do any of: claim a CI check is still running or in progress;
describe the 600 seconds as time remaining on a CI job; invent review work, code
changes or mutations the output does not contain; propose `pr-shepherd apply`
commands that were never emitted; declare the loop finished; ask the user what to
do.
