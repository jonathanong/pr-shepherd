---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan merges the whole stack with the single printed
`gh stack merge 342 --yes --squash`, which lands #341 and #342 together, then
reruns the same `pr-shepherd stack … --merge` command.

The output says one command lands every listed layer. Passing responses run it
once and do not touch the layers individually.

Following a branch-update step that Shepherd prints is allowed, and so is a
conditional "if the output says the branch is behind or conflicted, rebase or
merge the base and push it". Failing responses do any of: land layers one at a
time with `gh pr merge`; add their own rebase or push between merge steps;
run `gh stack push` unprompted; edit a PR's base branch by hand.
