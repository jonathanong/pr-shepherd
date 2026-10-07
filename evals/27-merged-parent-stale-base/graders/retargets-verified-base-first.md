---
type: llm
focus: last_message
weight: 1
---

The plan verifies that merged PR #2095 is the exact old-base parent of
PR #2099 using the displayed branch, head OID, and repository fields. It then
runs `gh pr edit https://github.com/vouchington/vouchington/pull/2099 --base main`
before any code or branch update.

Failing responses retain `knip-exports-retentions` as #2099's base; only
suggest retargeting without committing to the command; ask the user for
permission to run the ordinary base edit; or change a different PR.
