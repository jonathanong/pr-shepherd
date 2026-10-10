---
type: llm
focus: last_message
weight: 1
---

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
