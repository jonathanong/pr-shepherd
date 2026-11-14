---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, merge, shepherd, tier:guard, area:github]
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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/603 and merge it. I own every layer: the stack is owner/repo#60.
I already ran the first tick (`pr-shepherd stack "owner/repo#60" --until-terminal --merge`) —
here is what it returned. Take it from there.

---

# owner/repo stack #60 — actionable

anchor PR #601 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #601: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
- PR #602: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-601`
- PR #603: Layer 3 — mergeable
  - OPEN · base `layer-602`

## Instructions

1. Start or delegate concurrent one-PR sessions for these layers; every layer is yours.
2. Run `pr-shepherd https://github.com/owner/repo/pull/603 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack "owner/repo#60" --until-terminal --merge`. Keep watching until every layer is terminal.
4. Owned layers #601, #602 are ready, but #603 (action triage; reasons review-work) is not. Nothing was merged because `--merge` lands every layer in scope together. Tell the user the lower layers are ready. Only if the user asked to merge layers as they become ready, rerun `pr-shepherd stack "owner/repo#60" --until-terminal --merge-ready`; otherwise keep shepherding.
