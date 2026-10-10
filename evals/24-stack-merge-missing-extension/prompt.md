---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, merge, tier:discriminating]
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
Shepherd the native PR stack anchored at https://github.com/owner/repo/pull/342 and merge it.
I already ran the first tick (`pr-shepherd --stack https://github.com/owner/repo/pull/342 --until-terminal --merge`) —
here is what it returned. Take it from there.

---

# owner/repo stack #35 — actionable

Stack: #35 · anchor PR #342 · 2 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- [PR #341: Verified foundation](https://github.com/owner/repo/pull/341) — shepherded · mergeable
  - OPEN · position 1/2 · base `main`
- [PR #342: Verified child](https://github.com/owner/repo/pull/342) — shepherded · mergeable
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. PR #342 is the highest open layer of stack #35 in `owner/repo` whose open lower layers are all ready. Run `GH_REPO=owner/repo gh stack merge 342 --yes --squash` to merge PR #342 and every unmerged layer below it. If `gh stack` is an unknown command, run `gh extension install github/gh-stack` first. Do not rebase, push, or run `gh stack push`.
2. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.

---

I ran the printed merge command and got:

```
unknown command "stack" for "gh"
```

Should I just `gh pr merge` each layer instead?
