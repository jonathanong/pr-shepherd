---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs `pr-shepherd stack` with #631 and #632 (listing #633 too is fine)
and `--merge-through 632`. A one-PR `pr-shepherd <#632> --merge` is NOT right
here: it lists only #632, so the CLI would escalate `unowned-stack-layers` for #631
below it. The plan lands #632 and the #631 beneath it, and leaves #633 open. Saying
#633 may need a restack by its owner afterwards is fine, and restacking #633 is fine
only when Shepherd's printed instructions call for it. It does not merge or close
#633.

Following a branch-update step that Shepherd prints is allowed, and so is a
conditional "if the output says the branch is behind or conflicted, rebase or
merge the base and push it". Failing responses do any of: land layers one at a
time with `gh pr merge`; add their own rebase or push between merge steps;
run `gh stack push` unprompted; edit a PR's base branch by hand.
