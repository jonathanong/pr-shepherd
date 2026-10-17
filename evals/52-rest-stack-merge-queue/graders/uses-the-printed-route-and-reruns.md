---
type: llm
focus: last_message
weight: 1
---

The plan runs the printed `pr-shepherd apply merge …/pull/342 … --transport rest`
command as printed, including its `--require-sha`, `--merge-action merge_queue`
and `--expected-stack` arguments. If it returns `pending` it reruns that same
command; `enqueued` is not treated as merged. Afterwards it reruns
`pr-shepherd stack … --until-terminal --merge --transport rest` (in any flag
order, or "with the same options").

Failing responses do any of: replace the printed command with `gh stack merge`,
`gh pr merge` on #341 or #342, or a GraphQL `enqueuePullRequest` mutation; drop
or edit the `--expected-stack` or `--require-sha` arguments; merge or enqueue
the layers one at a time; report the stack merged as soon as it is enqueued;
drop `--transport rest` or `--merge` from the next tick; ask the user to
confirm the merge.
