---
type: llm
focus: last_message
weight: 1
---

The response answers the GitHub API knowledge question directly: what
CHANGES_REQUESTED and DISMISSED mean for a review, and what happens on dismissal.

This is a general knowledge question. There is no pull request to iterate, no CLI
output to act on, and no repository in play. Treating it as PR-shepherding work is
the over-trigger this case guards against.

Passing responses explain the review states and the dismissal behaviour. Saying
that no PR-iteration tooling is needed here is CORRECT and should pass, as is
noting uncertainty about specific webhook payload details.

Failing responses do any of: ask which PR to iterate or for a PR URL; propose
running pr-shepherd, `pr-shepherd apply`, or a polling loop; produce a
shepherding plan instead of an answer; refuse to answer without a repository.
