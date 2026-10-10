---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, shepherd, conflicts, tier:guard]
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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/312.
I already ran the first tick (`pr-shepherd --stack https://github.com/owner/repo/pull/312 --until-terminal`) —
here is what it returned. Take it from there.

---

# owner/repo stack #32 — actionable

anchor PR #312 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- [PR #311: Conflicting foundation](https://github.com/owner/repo/pull/311) — not mergeable (`conflicting`) · owned
  - OPEN · position 1/2 · base `main`
- [PR #312: Verified child](https://github.com/owner/repo/pull/312) — shepherded · mergeable
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/311 --until-terminal`.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
