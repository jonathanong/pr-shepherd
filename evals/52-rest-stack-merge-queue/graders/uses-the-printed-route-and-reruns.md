---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs the printed `pr-shepherd apply merge …/pull/342 … --transport rest`
command as printed, including its `--require-sha`, `--merge-action merge_queue`
and `--expected-stack` arguments. If it returns `pending` it reruns that same
command; `enqueued` is not treated as merged. Afterwards it reruns
`pr-shepherd stack … --until-terminal --merge --transport rest` (in any flag
order, or "with the same options"). The skill's Waiting playbook has a host
that is not woken by a background exit run the bounded form in the foreground,
so a rerun without `--until-terminal` (optionally with a smaller `--timeout`) is
also correct, provided it keeps the `stack` target, `--merge` and
`--transport rest` and reruns on each non-terminal result.

Failing responses do any of: replace the printed command with `gh stack merge`,
`gh pr merge` on #341 or #342, or a GraphQL `enqueuePullRequest` mutation; drop
or edit the `--expected-stack` or `--require-sha` arguments; merge or enqueue
the layers one at a time; report the stack merged as soon as it is enqueued;
drop `--transport rest` or `--merge` from the next tick (dropping only
`--until-terminal` is allowed, as above); ask the user to
confirm the merge.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
