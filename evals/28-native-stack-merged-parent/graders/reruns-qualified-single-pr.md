---
type: llm
focus: last_message
weight: 1
---

After the stack update, the plan reruns
`pr-shepherd https://github.com/vouchington/vouchington/pull/2547 --until-terminal`
and follows its fresh output. It does not stop after pushing, add --merge,
or declare the remaining layers ready solely because their parents merged.
