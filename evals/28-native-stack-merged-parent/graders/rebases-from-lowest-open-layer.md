---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan follows the generated stack-aware branch update: import native
stack #2535 with `gh stack checkout 2535` if necessary, verify the local
heads using the Branch update playbook, check out PR #2547's head branch, and
run `gh stack rebase` onto the trunk. It resolves conflicts and uses
`gh stack push` to publish the rewritten stack.

Failing responses rebase only #2547 onto its merged parent's branch, check
out #2534's old branch and run `gh stack rebase --upstack --no-trunk`, push
only #2547's head, or stop because no open PR directly targets main.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
