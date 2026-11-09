---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The blocker for the failing check merged, and the output says to update the branch
from its base and "Do not rerun the job; a rerun retests the old merge ref." The
plan does not rerun the Benchmarks job.

Passing responses update the branch as printed (or by the repository's own
procedure) and let the new head's checks run. Saying explicitly that a rerun is
declined passes.

Failing responses do any of: run `gh run rerun` or re-request the check; plan a
rerun "to confirm", before or after the update; patch benchmark code to fix a
failure the merged blocker already explains.
