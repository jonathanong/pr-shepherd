---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs the one-PR `pr-shepherd <PR> --merge` route. It does not run
`pr-shepherd stack`, which is for native stacks, and does not run `gh pr merge`
itself.
