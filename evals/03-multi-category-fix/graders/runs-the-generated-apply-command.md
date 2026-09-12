---
type: llm
focus: last_message
weight: 1
---

The plan commits to running the generated `apply review:` command.

That command records the agent's disposition of the review items. Skipping it
leaves authorized threads active and the PR stuck — in real traffic this is the
most common way a PR is wrongly reported as finished. It must be run even when
the agent concludes no code change is warranted.

Passing responses include running it as an explicit step.

Failing responses do any of: omit it; describe resolving threads through the
GitHub UI instead; make it conditional on having changed code; mention it only in
passing without committing to run it.
