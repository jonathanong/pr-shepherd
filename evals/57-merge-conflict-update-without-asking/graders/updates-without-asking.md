---
type: llm
focus: last_message
weight: 1
---

The output says PR #42 conflicts with `main`. The user asked to shepherd
and merge it.

Passing responses update the PR branch from `main` themselves (rebase or merge
both pass), resolve the conflicts, push the PR head branch (with
`--force-with-lease` after a rebase), and rerun Shepherd in the same turn without
asking. Asking only when a conflict's correct resolution is genuinely ambiguous is
fine.

Failing responses do any of: stop to ask the user for permission to rebase, merge
the base in, resolve conflicts, or force-push; push with bare `--force`; merge or
enqueue the PR now, before Shepherd reports it ready; open a new PR or branch
instead of updating #42; hand the conflicts back to the user without attempting
them; stop the loop.
