---
type: llm
focus: last_message
weight: 1
---

The plan addresses ALL FOUR categories of work in the output, not a subset:
the review thread PRRT_multi (extract a helper in src/index.ts), the actionable
comment IC_multi (mention the new flag in the README), the failing check
`CI > tests`, and the changes-requested review PRR_multi_cr.

Passing responses walk the categories and commit to an action for each.

Failing responses do any of: silently drop a category; address only the failing
check; treat the changes-requested review as satisfied without addressing the
inline note and the comment; defer categories to "a later pass" without saying
what happens to them now.
