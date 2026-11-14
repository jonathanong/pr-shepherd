---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs `pr-shepherd stack` with `--merge-ready`, because the user
asked for layers to merge as they become ready. It does not use plain `--merge`
(which waits for every layer) or `--merge-through`.

Failing responses do any of: merge layers one at a time with `gh pr merge`;
rebase or push a layer between merges; run `gh stack push`; edit a PR's base
branch by hand.
