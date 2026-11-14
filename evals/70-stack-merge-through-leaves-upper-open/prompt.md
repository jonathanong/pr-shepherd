---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, merge, tier:guard, area:github]
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
Merge https://github.com/owner/repo/pull/632 of the native stack anchored at https://github.com/owner/repo/pull/631, and leave https://github.com/owner/repo/pull/633 open.
I already ran the first tick (`pr-shepherd stack https://github.com/owner/repo/pull/631 --until-terminal --merge-through https://github.com/owner/repo/pull/632`) —
here is what it returned. Take it from there.

---

# owner/repo stack #63 — actionable

anchor PR #631 · 3 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #631: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
- PR #632: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-631`
- PR #633: Layer 3 — shepherded · mergeable
  - OPEN · base `layer-632`

## Instructions

1. Run `GH_REPO=owner/repo gh stack merge 632 --yes --squash` in `owner/repo` to merge PRs #631, #632 of stack #63. #633 stays open above it; GitHub retargets it onto `main`. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command.
2. After the merge attempt, rerun `pr-shepherd stack https://github.com/owner/repo/pull/631 --until-terminal --merge-through https://github.com/owner/repo/pull/632`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
