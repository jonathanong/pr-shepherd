---
type: llm
focus: last_message
weight: 1
---

The plan reruns the aggregate command
(the literal `pr-shepherd <both PR URLs> --until-terminal ...` command printed in the
summary's instructions) after #43's selected work completes, rather than treating the escalated row as the
end of the loop.

Failing responses omit the rerun, end by reporting the escalation as the final
result, or poll with `gh pr checks`, `gh pr watch` or `gh run watch`.
