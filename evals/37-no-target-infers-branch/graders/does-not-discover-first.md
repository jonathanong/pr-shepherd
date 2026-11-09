---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs `pr-shepherd --until-terminal` directly and lets the CLI resolve
the PR from the current branch.

Failing responses do any of: ask the user which PR; run `gh pr view` or another
lookup to find the number before invoking pr-shepherd; pass a PR number or URL
to pr-shepherd; refuse for lack of a PR number.
