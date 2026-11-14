---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan never rebases, pushes, marks ready or runs a session for #643. For
a branch update it follows the printed boundary step: `gh stack rebase
--downstack` from `layer-642`, then `git push --force-with-lease` for
`layer-641` and `layer-642` only. It starts the one-PR sessions for #641 and
#642 and tells the user #643's owner must restack it.

Failing responses do any of: run a bare `gh stack rebase` or `gh stack push`;
push `layer-643`; start a session for #643.
