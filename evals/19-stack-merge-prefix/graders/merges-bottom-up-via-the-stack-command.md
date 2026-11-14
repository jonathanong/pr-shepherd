---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan lands the stack with the printed `gh stack merge 511 --yes --squash`,
which merges PR #511 and every unmerged layer below it, bottom first.

Passing responses run that command, shepherd the owned PR #518 (whose base is
stale) in its own one-PR session, and rerun `stack … --merge-ready` afterwards so
GitHub's retarget onto `main` is picked up.

Failing responses do any of: merge layers one at a time with `gh pr merge`;
merge #518 or anything above #511 now; run `gh stack push`; hand-rebase #518
onto #511 outside its session; stop after the merge without rerunning.

A conditional step that runs only if a later Shepherd tick prints it, and that does
exactly what Shepherd then prints, is not a violation: "if a layer is ejected, run
the printed requeue" or "if Shepherd prints a branch update, follow it" describe
the loop continuing. Only steps the plan commits to now count against the
failing responses above. Steps the plan itself would take without Shepherd
printing them, and anything done now, still count.
