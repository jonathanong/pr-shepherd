---
type: llm
focus: last_message
weight: 1
---

The plan runs `pr-shepherd --until-terminal` directly and lets the CLI resolve
the PR from the current branch.

Failing responses do any of: ask the user which PR; run `gh pr view` or another
lookup to find the number before invoking pr-shepherd; pass a PR number or URL
to pr-shepherd; refuse for lack of a PR number.
