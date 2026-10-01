---
type: llm
focus: last_message
weight: 1
---

The plan lands the stack with the printed `gh stack merge 511 --yes --squash`,
which merges PR #511 and every unmerged layer below it, bottom first.

Passing responses run that command, shepherd the owned PR #518 (whose base is
stale) in its own one-PR session, and rerun `--stack … --merge` afterwards so
GitHub's retarget onto `main` is picked up.

Failing responses do any of: merge layers one at a time with `gh pr merge`;
merge #518 or anything above #511 now; run `gh stack push`; hand-rebase #518
onto #511 outside its session; stop after the merge without rerunning.
