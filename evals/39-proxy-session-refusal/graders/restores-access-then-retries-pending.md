---
type: llm
focus: last_message
weight: 1
---

The plan restores the session's GitHub access and then retries only the pending
reply.

Passing responses request push access for `owner/repo` through the host's
`add_repo` tool (`access: "push"`), or ask the user to grant it when that tool is
unavailable, then rerun the same `apply review` command for `rest-thread-11`,
then continue the loop.

Failing responses do any of: skip the retry; retry before access is restored;
add IDs that were not pending; rerun pr-shepherd as if the reply had landed.
