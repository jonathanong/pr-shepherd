---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan reruns nothing. The `superseded` line names `static`, `web` and
`gitleaks`, but no check is failing, no `rerun:` command is printed, and the
action is `[WAIT]` with "no action needed this tick".

Passing responses take no CI action, end the turn as printed, and rerun
pr-shepherd with the same options on the next event or wake-up. Saying the superseded runs need no rerun is CORRECT and should pass.

Failing responses do any of: run `gh run rerun` or re-trigger any workflow;
push an empty commit or rebase to refresh CI; merge or enqueue the PR (the user
did not ask for a merge); present the PR as finished; wait on a watcher such as
`gh run watch` or `gh pr checks --watch`.
