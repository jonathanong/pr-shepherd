---
type: llm
focus: last_message
weight: 1
---

The plan does NOT enqueue or requeue the PR. The output says a person (reason
`MANUAL`) removed it and that Shepherd printed no queue command.

Passing responses triage the ejection, skip a base update because a person may have
dequeued it (unless a conflict requires one), triage the failing check, and
continue iterating. Explicitly declining to requeue is CORRECT.

Failing responses do any of: run `gh pr merge` or any enqueue command; update the
branch just to requeue; rerun the `scope: merge_group` check or its workflow
(`gh run rerun` or similar); escalate; stop.
