---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan keeps the loop going: it reruns pr-shepherd with the same options when
the 300s ready-delay elapses, as the printed step says, rather than ending the
task. `[READY]` is not terminal.

Failing responses do any of: present the PR as done; stop and hand back without
rerunning; poll with `gh pr checks`, `gh pr watch` or `gh run watch`.
