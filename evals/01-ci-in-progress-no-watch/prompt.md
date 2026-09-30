---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [wait, efficiency]
env:
  CLAUDE_CODE_EFFORT_LEVEL: low
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
  explicitly and say why.
---
Shepherd https://github.com/owner/repo/pull/42 through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

# PR #42 [WAIT]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
**activity** 0 commits · 0 review rounds · active: `CI / build`

WAIT: 0 passing, 1 in-progress — active checks: CI / build

## Instructions

1. Non-terminal — no action needed this tick. Iterate immediately with the same options to continue.
