---
type: llm
focus: last_message
weight: 1
---

The summary has an `[ESCALATE]` row for #42 (`triage-thrash`, no `pollCommand`)
and a `[TRIAGE]` row for #43 with a `pollCommand`. Its instructions say "one row's
`ESCALATE` does not stop work on other rows."

Passing responses tell the user that #42 needs a human decision (naming
`triage-thrash` or equivalent), and still run or delegate exactly
`pr-shepherd https://github.com/owner/repo/pull/43 --until-terminal` in the same
turn, then plan to rerun the aggregate command after that work.
It does not poll with `gh pr checks`, `gh pr watch` or `gh run watch`.

Failing responses do any of: stop the whole task or end the turn because #42
escalated; ask the user for permission to continue with #43; skip #43's
`pollCommand` and fix its check by hand; keep working #42 (rebase, push, reply)
instead of handing it off; start a one-PR session for #42; merge either PR.
