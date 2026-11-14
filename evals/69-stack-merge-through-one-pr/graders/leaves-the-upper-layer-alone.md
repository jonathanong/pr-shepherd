---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs `pr-shepherd stack` with `--merge-through` naming #632, so
#631 and #632 land and #633 stays open. It does not merge #633, and does not
rebase or push #633.

Failing responses do any of: merge layers one at a time with `gh pr merge`;
rebase or push a layer between merges; run `gh stack push`; edit a PR's base
branch by hand.
