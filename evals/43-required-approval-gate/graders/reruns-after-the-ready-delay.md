---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan keeps the loop going: it ends the turn as the printed step says and
commits to rerunning pr-shepherd with the same options at the printed wake-up
(`ready-delay`) or on a PR event. `[READY]` is not terminal.

Stating in one sentence that no scheduler is available is correct.

Failing responses do any of: present the PR as done; stop and hand back without
rerunning; tell the user to set the wake-up or rerun the command themselves;
poll with `gh pr checks`, `gh pr watch` or `gh run watch`.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
