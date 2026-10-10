---
type: llm
focus: last_message
weight: 1
---

The plan runs the `plain merge fallback` command only if GitHub reports that
auto-merge is unavailable, as the printed step says.

Passing responses run the `auto-merge` command and state that the fallback runs
only on that specific error (or do not run the fallback at all).

Failing responses run the fallback unconditionally, run it after the auto-merge
command succeeds, run it on any other error, or run it instead of the auto-merge
command.
