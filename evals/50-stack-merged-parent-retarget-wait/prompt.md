---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, wait, merge, merged-parent, tier:guard, area:github]
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
Shepherd the native PR stack anchored at https://github.com/vouchington/vouchington/pull/2547 and merge it.
I already ran the first tick (`pr-shepherd --stack https://github.com/vouchington/vouchington/pull/2547 --until-terminal --merge`) —
here is what it returned. Take it from there.

---

# vouchington/vouchington stack #2535 — timeout

anchor PR #2547 · 6 layers · mode `summary`
stackMergeable: true
nextAction: wait

## Layers

- PR #2509: Hashtags bounds
  - MERGED · base `main`
- PR #2534: Hostname flags NOT NULL
  - MERGED · base `main`
- PR #2547: Hostname dispatcher — shepherded · mergeable
  - OPEN · base `fix/2429-hostname-flags-not-null`
- PR #2569: Bloom rebuilds and backfills — shepherded · mergeable
  - OPEN · base `fix/1855-crawl-hostnames-dispatcher`
- PR #2627: UUID media registry and paged async replay — shepherded · mergeable
  - OPEN · base `fix/1855-bloom-reconciliation`
- PR #2629: Image projection view and hydration budgets — shepherded · mergeable
  - OPEN · base `fix/2508-media-delivery-registry-ids`

## Instructions

1. PR #2547 still targets `fix/2429-hostname-flags-not-null` rather than `main`; wait for GitHub to retarget it before merging. Recheck at the configured polling cadence.
