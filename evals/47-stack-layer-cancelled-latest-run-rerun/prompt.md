---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, triage, ci-triage, tier:discriminating, area:github]
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
Shepherd https://github.com/vouchington/vouchington/pull/2687 through to a terminal state. It is the top layer of a
native PR stack; I pushed the stack with `gh stack push` a few minutes ago. I
already ran the first tick — here is what it returned. Take it from there.

---

# PR #2687 [TRIAGE]

**status** `FAILING` · **merge** `BLOCKED` · **reviewDecision** `APPROVED`
**summary** 3 passing
Required status checks: static, web, gitleaks [Required]
Stack: 2688 (layer 2/2, base main)

## Failing checks

- `200` — `static › static` [conclusion: CANCELLED]
  rerun: `gh run rerun 200 -R vouchington/vouchington`

- `201` — `web › web` [conclusion: CANCELLED]
  rerun: `gh run rerun 201 -R vouchington/vouchington`

- `202` — `gitleaks › gitleaks` [conclusion: CANCELLED]
  rerun: `gh run rerun 202 -R vouchington/vouchington`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/vouchington/vouchington/pull/2687 '- <decision>'`
5. Rerun Shepherd now.
