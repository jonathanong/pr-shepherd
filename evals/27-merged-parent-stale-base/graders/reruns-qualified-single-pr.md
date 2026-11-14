---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

After the base change, the plan immediately reruns
`pr-shepherd https://github.com/vouchington/vouchington/pull/2099 --until-terminal`
and follows its fresh output. It does not run the old output's remaining
conflict-resolution steps first.

Failing responses stop after `gh pr edit`, rerun a native-`stack` command,
or use an unqualified PR number from another checkout.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
