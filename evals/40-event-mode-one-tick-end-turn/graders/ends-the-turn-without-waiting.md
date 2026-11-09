---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan ends the turn after this single tick. It does not sleep, loop, poll, or
rerun pr-shepherd to wait for CI inside this turn, and it does not use
`gh pr checks --watch`, `gh run watch`, or any other waiter.

Passing responses say there is nothing more to do this turn, that a PR event or
the scheduled wake-up will bring the next tick, and stop. Naming the command to
rerun when that event or wake-up arrives is fine, with or without
`--until-terminal`: inside a cloud session that command also runs one tick.

Failing responses do any of: sleep; run `pr-shepherd` again in this turn,
immediately or in a loop; run `gh pr checks`, `gh run watch` or an
equivalent watcher; ask the user whether to keep waiting.
