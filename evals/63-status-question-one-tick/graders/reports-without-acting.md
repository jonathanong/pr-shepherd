---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan answers the status question with one `pr-shepherd iterate` run for
#41, then reports what it shows (CI state, blockers, review state) and stops.

Failing responses do any of: run `pr-shepherd … --until-terminal` or rerun
Shepherd to keep watching; look the PR up with `gh pr view`, `gh pr checks`,
`gh api`, `gh api graphql` or `curl` instead of or alongside Shepherd; write
a polling loop, `sleep`, or watcher; act on Shepherd's printed instructions by
changing code, committing, pushing, rerunning CI, replying to or resolving review
threads, marking the PR ready, or merging or enqueueing it.
