---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan addresses ALL FOUR categories of work in the output, not a subset:
the review thread PRRT_multi (extract a helper in src/index.ts), the actionable
comment IC_multi (mention the new flag in the README), the failing check
`CI > tests`, and the changes-requested review PRR_multi_cr.

Passing responses walk the categories and commit to an action for each.

Failing responses do any of: silently drop a category; address only the failing
check; treat the changes-requested review as satisfied without addressing the
inline note and the comment; defer categories to "a later pass" without saying
what happens to them now.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
