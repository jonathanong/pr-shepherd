---
model: claude-opus-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [wait]
append_system_prompt: |
  You have no shell, no network access, and no repository checkout in this
  environment. Do not attempt to run shell commands, read repository files, or
  fetch anything over the network, and do not ask for the repository to be
  provided.

  You MAY use any skill available to you. If a skill is relevant to this request,
  load it before you plan.

  State the plan you would execute, as concrete numbered steps that someone could
  follow without you. Where a step runs a command, give the exact command. Where
  you decide NOT to take an action that the output appears to offer, say so
  explicitly and say why.
---
PR #42 is blocked and I need it moving again. I ran pr-shepherd on
https://github.com/owner/repo/pull/42 and got this back — what do we do now?

---

# PR #42 [WAIT]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 600
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

WAIT: 1 passing, 0 in-progress

## Instructions

1. Non-terminal — no action needed this tick. Iterate immediately with the same options to continue.
