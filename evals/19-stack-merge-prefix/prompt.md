---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, merge, tier:guard]
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
Shepherd the native PR stack anchored at https://github.com/jonathanong/auto-harness/pull/518 and merge it.
I already ran the first tick (`pr-shepherd --stack https://github.com/jonathanong/auto-harness/pull/518 --until-terminal --merge`) —
here is what it returned. Take it from there.

---

# jonathanong/auto-harness stack #514 — actionable

anchor PR #518 · 5 layers · mode `summary`
nextAction: merge

## Layers

- PR #507: docs: clarify service account credential rotation — shepherded
  - MERGED · base `main`
- PR #508: feat(host): mint per-session GitHub App tokens
  - MERGED · base `main`
- PR #510: [codex] add verified custom webhook ingress — shepherded · mergeable
  - OPEN · base `main`
- PR #511: [codex] add GitHub trigger and pull-ref foundation — shepherded · mergeable
  - OPEN · base `codex/webhook-platform`
- PR #518: [codex] add GitHub App comment ingress — not mergeable (`stale-ancestry`) · owned
  - OPEN · base `codex/github-ingress-foundation`

## Stack ancestry

- PR #518 base `codex/github-ingress-foundation` at `31259f721bca9ed99b534b8cfb82367bcaf737bc` differs from parent PR #511 head `codex/github-ingress-foundation` at `b94436d2ddf60c55948b953610b16b34cff7b4da`.

## Instructions

1. PR #511 is the highest open layer of stack #514 in `jonathanong/auto-harness` whose open lower layers are all ready. Run `GH_REPO=jonathanong/auto-harness gh stack merge 511 --yes --squash` to merge PR #511 and every unmerged layer below it. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command. Do not rebase, push, or run `gh stack push`.
2. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
3. Run `pr-shepherd https://github.com/jonathanong/auto-harness/pull/518 --until-terminal --merge`.
4. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
