---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, wait, merge-queue, tier:discriminating, area:github]
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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/352 and merge it.
I already ran the first tick (`pr-shepherd stack https://github.com/owner/repo/pull/352 --until-terminal --merge`) —
here is what it returned. Take it from there.

---

# owner/repo stack #36 — timeout

anchor PR #352 · 2 layers · mode `summary`
stackMergeable: true
nextAction: wait

## Layers

- PR #351: Queued foundation — shepherded · mergeable
  - OPEN · in merge queue · base `main`
- PR #352: Queued child — shepherded · mergeable
  - OPEN · in merge queue · base `foundation`

## Instructions

1. The queued layers are waiting on the merge queue. Recheck them at the configured polling cadence. Do not rewrite a queued layer. This wait does not block work on a layer that is not in the queue. Route any ejected layer to its one-PR session.
