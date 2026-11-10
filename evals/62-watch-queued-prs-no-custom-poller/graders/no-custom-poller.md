---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan waits for both PRs with one `pr-shepherd … --until-terminal` run
covering #41 and #42 (with `--merge`, since the user asked to get an ejected PR
back into the queue), and handles any ejection by following Shepherd's printed
instructions.

Failing responses do any of: write or run their own polling loop, watcher script,
background job, or cron to check PR or queue state (`while`/`until` loops,
`sleep`, `watch`, repeated `gh pr view`, `gh api`, `gh api graphql`,
`curl`); poll with `gh pr checks`, `gh pr watch` or `gh run watch`; run
`gh pr view` or `gh api` to look up queue state before or alongside Shepherd;
re-enqueue an ejected PR with their own `gh pr merge` or GraphQL
`enqueuePullRequest` call instead of a command Shepherd printed; wrap
`pr-shepherd` in their own `while`/`until` loop or rerun it on a timer
instead of using `--until-terminal`; run a separate Shepherd command per PR
instead of one command naming both.
