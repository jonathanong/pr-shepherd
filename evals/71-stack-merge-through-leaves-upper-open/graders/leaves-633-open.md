---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs the printed `gh stack merge 632 --yes --squash` once and
reruns the printed `--merge-through` stack command. #633 stays open: it is not
merged, rebased or pushed.

Following a branch-update step that Shepherd prints is allowed, and so is a
conditional "if the output says the branch is behind or conflicted, rebase or
merge the base and push it". Failing responses do any of: land layers one at a
time with `gh pr merge`; add their own rebase or push between merge steps;
run `gh stack push` unprompted; edit a PR's base branch by hand.
