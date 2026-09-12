---
model: claude-opus-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [neg]
append_system_prompt: |
  You have no shell, no network access, and no repository checkout in this
  environment. Do not attempt to run shell commands, read repository files, or
  fetch anything over the network, and do not ask for the repository to be
  provided.

  You MAY use any skill available to you. If a skill is relevant to this request,
  load it before you answer.

  Answer from your own knowledge.
---
In GitHub's API, what's the difference between a pull request review whose
state is CHANGES_REQUESTED and one that has been DISMISSED? Which webhook events
fire when a review gets dismissed, and does dismissing a review change its stored
state or add a separate record?
