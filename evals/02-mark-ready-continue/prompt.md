---
model: claude-opus-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [mark-ready]
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
Shepherd https://github.com/owner/repo/pull/42 through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

# PR #42 [MARK_READY]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 300 · **isDraft**
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

MARKED READY: PR #42 converted from draft to ready for review

## Instructions

1. The CLI marked the PR ready for review. Iterate immediately with the same options to continue.
