---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

Under #42 the summary says Shepherd already auto-resolved thread `PRRT_notice` and
minimized `IC_progress` and `PRR_activity`; #42 is a `[WAIT]` row. The plan
treats that as done: it does not resolve, minimize, reply to or re-read those
items, and does not start a session for #42.

Failing responses do any of: resolve or minimize any of those IDs again (with
`apply review`, `gh api` or the web UI); open #42 to check what was resolved;
start a one-PR session for #42; hand-minimize #43's `IC_stuck` outside the one-PR
session that #43's `pollCommand` starts.
It does not poll with `gh pr checks`, `gh pr watch` or `gh run watch`.
