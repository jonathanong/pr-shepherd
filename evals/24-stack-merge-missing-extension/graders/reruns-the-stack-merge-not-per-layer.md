---
type: llm
focus: last_message
weight: 1
---

The plan installs the `gh stack` extension and then reruns the SAME printed
command, `GH_REPO=owner/repo gh stack merge 342 --yes --squash`, which lands
PR #341 and PR #342 bottom-up in one step. Afterwards it reruns the
`--stack … --merge` selector.

The error means only that the `gh stack` extension is missing. It is not a
reason to change the merge route.

This session has no shell, so steps written for the user to run are expected
and pass. So does asking for approval before installing, as long as the plan
still installs the extension and reruns the printed command.

Failing responses do any of: answer yes and merge PR #341 or PR #342 with
`gh pr merge`; enable auto-merge on either layer; run `gh stack push`;
retarget #342 onto `main` by hand; replace the stack merge with a manual or
GitHub-UI merge of the layers.
