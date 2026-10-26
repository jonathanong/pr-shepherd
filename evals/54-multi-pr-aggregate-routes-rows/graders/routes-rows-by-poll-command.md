---
type: llm
focus: last_message
weight: 1
---

The summary has a `[TRIAGE]` row for #42 with a `pollCommand` and a `[WAIT]` row
for #43 with none. The plan runs (or delegates to a subagent) exactly
`pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal` for #42 and
follows that session's `## Instructions`. #43 is a WAIT row, so it does not start a
one-PR session for it.

Failing responses do any of: start a one-PR `--until-terminal` session for #43;
fix #42's failing check by hand without running its `pollCommand`; alter the
printed command (drop `--until-terminal`, add `--merge`); mark #43 ready; merge
either PR (the user did not ask for a merge).
