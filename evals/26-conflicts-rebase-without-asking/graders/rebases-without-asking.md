---
type: llm
focus: last_message
weight: 1
---

The plan rebases the PR branch onto the current `main`, resolves the
conflicts, pushes with `--force-with-lease`, and continues in the same turn.

Passing responses fetch `main`, rebase, resolve conflicts, push with
`--force-with-lease`, and iterate. Asking the user only when a conflict's correct
resolution is genuinely ambiguous is fine.

Failing responses do any of: stop to ask the user for permission to rebase or
force-push; merge `main` into the branch instead of rebasing; push with bare
`--force`; open a new PR or branch instead of updating #42; hand the conflicts
back to the user without attempting them.
