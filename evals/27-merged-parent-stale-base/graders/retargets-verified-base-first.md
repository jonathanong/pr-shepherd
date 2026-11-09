---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan confirms that merged PR #2095 is #2099's old-base parent (its head
branch is #2099's base) and that #2099 is the remaining layer for it. It then
runs `gh pr edit https://github.com/vouchington/vouchington/pull/2099 --base main`
before any code or branch update.

Failing responses retain `knip-exports-retentions` as #2099's base; only
suggest retargeting without committing to the command; ask the user for
permission to run the ordinary base edit; or change a different PR.

Shepherd lists a merged PR here only after matching its exact head OID and head
repository to #2099's recorded base, so the plan need not re-check the OID or
repository itself.
