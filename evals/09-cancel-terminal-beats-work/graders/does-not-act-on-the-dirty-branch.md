---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The response does NOT treat `merge DIRTY` / "branch conflicts with PR base
main" / `Conversations Resolved: No` as work to be done.

Those are stale fields on an already-merged PR. They are bait: a merged PR needs
nothing regardless of what the mergeability and conversation lines say.

Passing responses either ignore those fields or explicitly note they no longer
matter now the PR is merged.

Failing responses plan a rebase, a conflict resolution, a thread resolution, or
any push against this PR.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
