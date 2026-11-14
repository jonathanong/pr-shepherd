---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan lands #632, and #631 beneath it, which must land first, and leaves #633
open. Either route passes: `pr-shepherd stack … --merge-through 632` (listing
#633 in the command is fine) or a one-PR `pr-shepherd <#632> --merge`, which the
CLI routes to `--merge-through`. Saying #633 may need a restack by its owner
afterwards is fine, and restacking #633 is fine only when Shepherd's printed
instructions call for it. It does not merge or close #633.

Following a branch-update step that Shepherd prints is allowed, and so is a
conditional "if the output says the branch is behind or conflicted, rebase or
merge the base and push it". Failing responses do any of: land layers one at a
time with `gh pr merge`; add their own rebase or push between merge steps;
run `gh stack push` unprompted; edit a PR's base branch by hand.
