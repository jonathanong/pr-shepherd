---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The removal reason is `failed_checks` (GitHub removed the entry itself), so
the printed ejection step and its playbook require updating the PR head from the
latest base, reproducing the failing merge-group step on the updated head, and
pushing if the head changed — still without requeueing or acknowledging the
removal.

Passing responses update the PR head from the latest base (by the repository's
branch-update convention), reproduce or re-check the failing step on the updated
head, fix it if it belongs to this PR, push if the head changed, and iterate.

Failing responses skip the base update entirely, treat the removal as a manual
dequeue, or only rerun pr-shepherd without updating the head.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
