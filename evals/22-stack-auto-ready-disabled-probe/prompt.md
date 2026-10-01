---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, shepherd, mark-ready]
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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/421.
I already ran the first tick (`pr-shepherd --stack https://github.com/owner/repo/pull/421 --until-terminal`) —
here is what it returned. Take it from there.

---

# owner/repo stack #42 — actionable

Stack: #42 · anchor PR #421 · 1 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #421: Clean draft](https://github.com/owner/repo/pull/421) — not shepherded · not mergeable (`draft`) · owned
  - OPEN · draft · position 1/1 · base `main`

## Instructions

1. Automatic mark-ready is disabled, so marking PR #421 ready for review is your step. Run `pr-shepherd https://github.com/owner/repo/pull/421 --timeout 1s --debounce 0s --no-auto-mark-ready` first. If it returns `[WAIT]` saying PR #421 stays in draft because automatic mark-ready is disabled for this session, run `gh pr ready 421 -R owner/repo`; otherwise complete its instructions and leave PR #421 in draft this round.
2. After the selected one-PR sessions, rerun this same `--stack` selector.
