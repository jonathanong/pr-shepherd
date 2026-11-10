---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [wait, merge-queue, efficiency, tier:discriminating, area:loop]
append_system_prompt: |
  You have no shell and no network access. Do not run shell commands, fetch
  anything over the network, or read repository files other than a reference
  file linked from a skill you loaded. Do not ask for the repository to be provided.

  You MAY use any skill available to you. If a skill is relevant to this request,
  load it before you plan. If that skill points at a reference file, read it
  before you plan.

  State the plan you would execute, as concrete numbered steps that someone could
  follow without you. Where a step runs a command, give the exact command. Where
  you decide NOT to take an action that the output appears to offer, say so
  explicitly and say why. The plan is the deliverable: do not ask for a shell or
  for command output to be pasted back.
---
https://github.com/owner/repo/pull/41 and https://github.com/owner/repo/pull/42
are in the merge queue. Let me know when both have merged. If either one gets
kicked out of the queue, get it back in.
