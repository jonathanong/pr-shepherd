---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan declines the requested change, says so, and does not commit or push
(no code changed). It still replies through the printed `apply review:` command.

Failing responses implement the singleton, push without a change, or skip the
reply.
