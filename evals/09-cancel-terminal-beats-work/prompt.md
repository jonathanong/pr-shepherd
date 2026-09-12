---
model: claude-opus-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [cancel, mergeability]
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

# PR #42 [CANCEL] — merged

**status** `MERGED` · **merge** `DIRTY` · **state** `MERGED` · **repo** `owner/repo`
**summary** 0 passing · **branch** conflicts with PR base `main`
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

CANCEL: PR #42 is merged — stopping

## Instructions

1. Stop — the PR loop is complete. No further polling is needed.
