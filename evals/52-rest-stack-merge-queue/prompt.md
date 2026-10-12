---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, merge, merge-queue, rest, tier:guard]
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
I already ran the first tick (`pr-shepherd --stack https://github.com/owner/repo/pull/342 --until-terminal --merge --transport rest`) —
here is what it returned. Take it from there.

---

# owner/repo stack #35 — actionable

anchor PR #342 · 2 layers · mode `summary`
stackMergeable: true
nextAction: merge

## Layers

- PR #341: Verified foundation — shepherded · mergeable
  - OPEN · merge queue required · base `main`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history
- PR #342: Verified child — shepherded · mergeable
  - OPEN · merge queue required · base `foundation`
  - transport `rest`
  - unavailable `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
  - unavailable `viewerAuthorization`: REST does not expose viewer capability fields
  - unavailable `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
  - unavailable `mergeQueue`: REST does not expose queue membership, entry or removal history

## Instructions

1. PR #342 is the highest ready layer of native stack #35. Run `pr-shepherd apply merge https://github.com/owner/repo/pull/342 --require-sha e222222222222222222222222222222222222222 --merge-action merge_queue --expected-stack '{"number":35,"baseRefName":"main","prefix":[{"pr":341,"headRefName":"foundation","headRefOid":"e111111111111111111111111111111111111111","baseRefName":"main"},{"pr":342,"headRefName":"child","headRefOid":"e222222222222222222222222222222222222222","baseRefName":"foundation"}]}' --transport rest` to request merging PR #342 and every unmerged layer below it. If status is `pending`, rerun that command at the configured cadence to resume its UUID. `enqueued` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.
2. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.
