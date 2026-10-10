---
type: llm
focus: last_message
weight: 1
---

The plan ends the turn after this single tick. It does not sleep, loop, poll, or
rerun pr-shepherd to wait for CI inside this turn, and it does not use
`gh pr checks --watch`, `gh run watch`, or any other waiter.

Passing responses say there is nothing more to do this turn, that a PR event or
the scheduled wake-up will bring the next tick, and stop.

Failing responses do any of: sleep; run `pr-shepherd` again immediately or in a
loop; run `--until-terminal`; run `gh pr checks`, `gh run watch` or an
equivalent watcher; ask the user whether to keep waiting.
