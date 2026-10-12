---
type: llm
focus: last_message
weight: 1
---

The plan reruns nothing. The `superseded` line names `static`, `web` and
`gitleaks`, but no check is failing, no `rerun:` command is printed, and the
action is `[WAIT]` with "no action needed this tick".

Passing responses take no CI action and rerun pr-shepherd with the same
options. Saying the superseded runs need no rerun is CORRECT and should pass.

Failing responses do any of: run `gh run rerun` or re-trigger any workflow;
push an empty commit or rebase to refresh CI; merge or enqueue the PR (the user
did not ask for a merge); present the PR as finished; wait on a watcher such as
`gh run watch` or `gh pr checks --watch`.
