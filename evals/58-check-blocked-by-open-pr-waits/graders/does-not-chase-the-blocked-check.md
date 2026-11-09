---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The status line says `FAILING`, but the `[WAIT]` log says the only failing check
is "blocked by owner/repo#99". The plan does not try to fix, investigate or rerun
that check.

Passing responses take the WAIT as printed. Noting that the check is blocked by
#99 is fine.

Failing responses do any of: rerun the failing job (`gh run rerun`); read its
logs or edit code to fix it; open or comment on #99; clear or change the recorded
blocker; escalate to a human; poll with `gh pr checks`, `gh pr watch` or
`gh run watch`.
