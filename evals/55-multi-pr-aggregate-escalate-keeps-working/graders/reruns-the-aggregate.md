---
type: llm
focus: last_message
weight: 1
---

The plan reruns the aggregate command
(`pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal`)
after #43's selected work completes, rather than treating the escalated row as the
end of the loop.

Failing responses omit the rerun, end by reporting the escalation as the final
result, or poll with `gh pr checks`, `gh pr watch` or `gh run watch`.
