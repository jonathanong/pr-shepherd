---
type: llm
focus: last_message
weight: 1
---

After the base change, the plan immediately reruns
`pr-shepherd https://github.com/vouchington/vouchington/pull/2099 --until-terminal`
and follows its fresh output. It does not run the old output's remaining
conflict-resolution steps first.

Failing responses stop after `gh pr edit`, rerun a native-stack selector,
or use an unqualified PR number from another checkout.
