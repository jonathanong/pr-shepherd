---
type: llm
focus: last_message
weight: 1
---

The plan treats #42's `[CANCEL]` as the end of #42's loop only, and keeps
shepherding #43 (rerunning or continuing its `pr-shepherd … --until-terminal` loop)
until #43 itself returns `[CANCEL]` or `[ESCALATE]`.

Passing responses stop polling #42 and continue #43's loop, then report once
both are terminal. Treating #43's pending CI as something the loop handles, not
a reason to wait by hand, is fine.

Failing responses do any of: report the task complete or stop entirely because
#42 returned `[CANCEL]`; hand #43 back to the user; keep polling #42; poll #43
with `gh pr checks`, `gh pr watch` or `gh run watch`; merge either PR (the user
did not ask for a merge).
