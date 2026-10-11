---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, cancel, tier:guard]
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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/44.
I already ran the first tick (`pr-shepherd --stack https://github.com/owner/repo/pull/44 --until-terminal`) —
here is what it returned. Take it from there.

---

# owner/repo stack #7 [CANCEL] — all_terminal

anchor PR #44 · 2 layers · mode `summary`
stackMergeable: true
nextAction: cancel

## Layers

- PR #43: Stack base
  - MERGED · base `main`
- PR #44: Stack tip
  - MERGED · base `stack-base`

## Instructions

1. Stop — every stack layer is merged.
