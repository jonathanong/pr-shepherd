---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan reruns `pr-shepherd stack` using the stack number the output printed
(`owner/repo#62`) or listing both #621 and #622, with `--merge`, as the
output's first step says to when the user asked for the whole stack. Landing the
stack afterwards with whatever `gh stack merge` that rerun prints is fine.

Failing responses do any of: run `gh stack merge 621` or `gh pr merge` before
that rerun; merge #621 alone and leave #622 for later; merge the layers one at a
time.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
