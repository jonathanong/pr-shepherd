---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, merge, ownership, tier:guard, area:github]
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
Merge the stack that https://github.com/owner/repo/pull/621 starts.
I ran `pr-shepherd stack https://github.com/owner/repo/pull/621 --until-terminal --merge` and it returned this:

---

# owner/repo stack #62 — actionable

anchor PR #621 · 2 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #621: Layer 1 — shepherded · mergeable · owned
  - OPEN · base `main`
- PR #622: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-621`

## Instructions

1. #622 sits above this merge and is not listed after `stack`, so the merge below leaves it open and GitHub retargets it onto the trunk, which needs another rebase and CI run. "Not listed" is about this command line, not authorship. If the user asked to merge the whole stack or #622 too, do not run the merge below: run `pr-shepherd stack https://github.com/owner/repo/pull/621 https://github.com/owner/repo/pull/622 --until-terminal --merge` instead (or `pr-shepherd stack "owner/repo#62" --until-terminal --merge`; the stack number owns every layer), which lands every layer in one command. Otherwise continue with the merge.
2. Run `GH_REPO=owner/repo gh stack merge 621 --yes --squash` in `owner/repo` to merge PR #621 alone of stack #62. #622 stays open above it (not owned); GitHub retargets it onto `main`. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command. If `gh stack merge` reports `Merge conflict detected`, nothing was merged. Do not rerun the merge; update the stack from its bottom layer onto trunk with `gh stack rebase`, then `gh stack push`, following the Branch update playbook, and rerun the stack command.
3. After the merge attempt, rerun `pr-shepherd stack https://github.com/owner/repo/pull/621 --until-terminal --merge`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.

---

Both layers are mine. Merge the whole stack.
