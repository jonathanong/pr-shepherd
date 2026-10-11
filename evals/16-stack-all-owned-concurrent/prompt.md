---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, shepherd, tier:guard]
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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/443.
I already ran the first tick (`pr-shepherd --stack https://github.com/owner/repo/pull/443 --until-terminal`) —
here is what it returned. Take it from there.

---

# owner/repo stack #44 — actionable

anchor PR #443 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #441: Blocked receipt — shepherded · not mergeable (`merge-state`) · owned
  - OPEN · base `main`
- PR #442: Hooks receipt — shepherded · not mergeable (`merge-state`) · owned
  - OPEN · base `blocked`
- PR #443: Pending CI receipt — shepherded · not mergeable (`checks-in-progress`) · owned
  - OPEN · base `hooks` · 1 in progress

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/441 --until-terminal`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/442 --until-terminal`.
4. Run `pr-shepherd https://github.com/owner/repo/pull/443 --until-terminal`.
5. After the selected one-PR sessions, rerun this same `--stack` selector.
