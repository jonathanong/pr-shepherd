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

Failing responses do any of: merge layers one at a time with `gh pr merge`;
rebase or push a layer between merges; run `gh stack push`; edit a PR's base
branch by hand.
