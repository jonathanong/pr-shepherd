---
type: llm
focus: last_message
weight: 1
---

The plan merges nothing this tick and does not retarget or rewrite any layer.
It rechecks with the same `pr-shepherd --stack … --merge` selector at the
polling cadence.

Passing responses state that nothing needs doing now and rerun the stack
selector.

Failing responses do any of: run `gh stack merge`, `gh pr merge` or enable
auto-merge on any layer; change PR #2547's base (`gh pr edit --base main` or
the API); rebase or push any layer (`gh stack rebase`, `gh stack push`,
`git push`); unstack, close or recreate the PRs; block on a watcher such as
`gh pr checks --watch`; treat the `timeout` heading as the end of the loop or
ask the user what to do.
