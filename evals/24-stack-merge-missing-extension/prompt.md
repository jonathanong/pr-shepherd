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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/342 and merge it. I own every layer: the stack is owner/repo#35.
I already ran the first tick (`pr-shepherd stack "owner/repo#35" --until-terminal --merge`) —
here is what it returned. Take it from there.

---

# owner/repo stack #35 — actionable

anchor PR #342 · 2 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #341: Verified foundation — shepherded · mergeable
  - OPEN · base `main`
- PR #342: Verified child — shepherded · mergeable
  - OPEN · base `foundation`

## Instructions

1. Run `GH_REPO=owner/repo gh stack merge 342 --yes --squash` in `owner/repo` to merge PRs #341, #342 of stack #35. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command. If `gh stack merge` reports `Merge conflict detected`, nothing was merged. Do not rerun the merge; update the stack from its bottom layer onto trunk with `gh stack rebase`, then `gh stack push`, following the Branch update playbook, and rerun the stack command.
2. After the merge attempt, rerun `pr-shepherd stack "owner/repo#35" --until-terminal --merge`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.

---

I ran the printed merge command and got:

```
unknown command "stack" for "gh"
```

Should I just `gh pr merge` each layer instead?
