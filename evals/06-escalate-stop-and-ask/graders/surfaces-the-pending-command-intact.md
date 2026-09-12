---
type: llm
focus: last_message
weight: 1
---

The response carries the pending `apply review:` command forward to the user
rather than dropping it.

The escalation exists precisely because two bot CHANGES_REQUESTED reviews are
still undismissed; the command that would dismiss them is the point of the
handoff. Presenting the escalation without it leaves the user unable to act.

Passing responses show or reference the pending command, including both review
IDs, as what they are asking permission to run.

Failing responses do any of: summarise the escalation without the command; name
only one of the two reviews; tell the user to resolve it manually with no
reference to the generated command.
