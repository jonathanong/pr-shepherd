---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The CLI only builds the patch. After `suggest`, the plan
applies the returned patch, commits and pushes it to the PR head branch, then
runs the printed `apply review` command from the pushed checkout, so its
`--require-sha` resolves to the pushed SHA, with `$CHANGE_MESSAGE` replaced by
a one-sentence summary.

Passing responses do all of that before iterating. Inspecting the source instead
of applying a patch the command refused is also correct.

Failing responses stop after building the patch, rerun pr-shepherd without
applying, committing and pushing it, or skip the `apply review` command.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
