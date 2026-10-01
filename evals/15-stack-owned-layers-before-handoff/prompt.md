---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, shepherd, escalate]
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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/403.
I already ran the first tick (`pr-shepherd --stack https://github.com/owner/repo/pull/403 --until-terminal`) —
here is what it returned. Take it from there.

---

# owner/repo stack #40 — actionable

Stack: #40 · anchor PR #403 · 3 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #401: Human handoff](https://github.com/owner/repo/pull/401) — not shepherded · not mergeable (`mark-ready-authorization-required`)
  - OPEN · draft · position 1/3 · base `main`
- [PR #402: Independent review work](https://github.com/owner/repo/pull/402) — not shepherded · mergeable · owned
  - OPEN · position 2/3 · base `foundation`
- [PR #403: Pending CI](https://github.com/owner/repo/pull/403) — not shepherded · not mergeable (`checks-in-progress`) · owned
  - OPEN · position 3/3 · base `review-work` · 1 in progress

## Instructions

1. Start or delegate one-PR sessions only for rows marked `owned`. Leave every other author's layer untouched. Owned layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/402 --until-terminal` for PR #402.
3. Run `pr-shepherd https://github.com/owner/repo/pull/403 --until-terminal` for PR #403.
4. PR #401 requires human action (mark-ready-authorization-required). Keep shepherding other PRs before the handoff.
5. After the listed one-PR sessions, rerun this same `--stack` selector. Stop for the human handoff only when no autonomous shepherding remains.
