---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan reruns `pr-shepherd stack` using the stack number the output printed
(`owner/repo#61`) or listing #611, #612 and #613, with `--merge` or
`--merge-through 613`. Landing the stack with the printed `gh stack merge`
afterwards is fine.

Failing responses do any of: run `gh pr merge` or `gh stack merge` before that
rerun; merge only #613; list only #612 and #613.
