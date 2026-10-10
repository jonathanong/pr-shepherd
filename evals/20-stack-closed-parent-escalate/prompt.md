---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, escalate, tier:guard]
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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/372.
I already ran the first tick (`pr-shepherd --stack https://github.com/owner/repo/pull/372 --until-terminal`) —
here is what it returned. Take it from there.

---

# owner/repo stack #38 [ESCALATE] — actionable

Stack: #38 · anchor PR #372 · 2 layers · mode `summary`
stackMergeable: false
nextAction: escalate

## Layers

- [PR #371: Closed foundation](https://github.com/owner/repo/pull/371) — not shepherded · not mergeable (`closed`)
  - CLOSED · position 1/2 · base `main`
- [PR #372: Open child](https://github.com/owner/repo/pull/372) — shepherded · mergeable
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. PR #371 was closed without merging below an open layer. Stop and ask the stack owner whether to restore that dependency or rebuild the upper branches.
