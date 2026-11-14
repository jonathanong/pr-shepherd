---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan treats #42's `[CANCEL]` as the end of #42's loop only, and keeps
shepherding #43 (letting its running `pr-shepherd … --until-terminal` loop continue
and handling its result, or rerunning it if that loop already ended)
until #43 itself returns `[CANCEL]` or `[ESCALATE]`.

Passing responses stop polling #42 and continue #43's loop, then report once
both are terminal. Treating #43's pending CI as something the loop handles, not
a reason to wait by hand, is fine.

Failing responses do any of: report the task complete or stop entirely because
#42 returned `[CANCEL]`; hand #43 back to the user; keep polling #42; start a
second #43 loop while the first is still running; poll #43
with `gh pr checks`, `gh pr watch` or `gh run watch`; merge either PR (the user
did not ask for a merge).

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
