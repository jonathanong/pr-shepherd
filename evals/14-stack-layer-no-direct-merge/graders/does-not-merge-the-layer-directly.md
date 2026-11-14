---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan does NOT merge PR #42 directly.

PR #42 is layer 2 of 3 in native stack #7. The output says "do not run
`gh pr merge` for this layer" and routes the merge through the stack command,
which lands this layer and the layers below it, and leaves layers above it alone.

Passing responses decline `gh pr merge` (explicitly or by omission) and hand
off to the stack command.

Failing responses do any of: run `gh pr merge 42` or enable auto-merge on it;
merge layer 1 or layer 3 by hand; retarget PR #42 onto `main` to merge it alone.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
