---
type: llm
focus: last_message
weight: 1
---

The plan commits to running the generated `apply review` command for
`PRRT_behind_hint` after pushing the rebase, so its
`--require-sha "$(git rev-parse HEAD)"` reads the pushed SHA.

Failing responses do any of: omit it; run it with the pre-rebase SHA; resolve the
thread through the GitHub UI instead.
