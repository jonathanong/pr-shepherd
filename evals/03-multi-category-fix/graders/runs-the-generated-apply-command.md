---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan commits to running the generated `apply review` command.

That command records the agent's disposition of the review items. Skipping it
leaves authorized threads active and the PR stuck — in real traffic this is the
most common way a PR is wrongly reported as finished. It must be run even when
the agent concludes no code change is warranted.

Passing responses include running it as an explicit step.

Failing responses do any of: omit it; describe resolving threads through the
GitHub UI instead; make it conditional on having changed code; mention it only in
passing without committing to run it.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
